import { describe, expect, it, vi } from 'vitest';

import { REALM_GRASS_BIOME_PROFILES } from '../src/game/map/realmGrass';
import {
  REALM_GRASS_NOISE_CHANNELS,
  REALM_GRASS_NOISE_WAVELENGTHS,
  sampleRealmGrassCoverage,
  sampleRealmGrassValueNoise
} from '../src/game/map/realmGrassNoise';

describe('procedural grass coverage noise', () => {
  it('is deterministic, channel-separated, and does not call Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const world = { x: 4.25, z: -2.75 };
    const first = sampleRealmGrassCoverage(3_445_214_658, world);
    const second = sampleRealmGrassCoverage(3_445_214_658, world);
    const otherChannel = sampleRealmGrassValueNoise(
      3_445_214_658,
      world,
      REALM_GRASS_NOISE_WAVELENGTHS.macro,
      'realm-grass-independent-test-v1'
    );

    expect(first).toEqual(second);
    expect(first.macro).not.toBe(otherChannel);
    expect(random).not.toHaveBeenCalled();
  });

  it('stays continuous across a hex boundary so clearings do not form a grid', () => {
    const left = sampleRealmGrassValueNoise(
      3_445_214_658,
      { x: Math.sqrt(3) * 0.5 - 0.001, z: 0 },
      REALM_GRASS_NOISE_WAVELENGTHS.macro,
      REALM_GRASS_NOISE_CHANNELS.macro
    );
    const right = sampleRealmGrassValueNoise(
      3_445_214_658,
      { x: Math.sqrt(3) * 0.5 + 0.001, z: 0 },
      REALM_GRASS_NOISE_WAVELENGTHS.macro,
      REALM_GRASS_NOISE_CHANNELS.macro
    );
    expect(Math.abs(left - right)).toBeLessThan(0.01);
  });

  it('freezes the intended biome bare-patch ordering and lake exclusion', () => {
    expect(REALM_GRASS_BIOME_PROFILES.meadow.completelyBareThreshold)
      .toBeLessThan(REALM_GRASS_BIOME_PROFILES.lowland.completelyBareThreshold);
    expect(REALM_GRASS_BIOME_PROFILES.lowland.completelyBareThreshold)
      .toBeLessThan(REALM_GRASS_BIOME_PROFILES.forest.completelyBareThreshold);
    expect(REALM_GRASS_BIOME_PROFILES.forest.completelyBareThreshold)
      .toBeLessThan(REALM_GRASS_BIOME_PROFILES.heath.completelyBareThreshold);
    expect(REALM_GRASS_BIOME_PROFILES.heath.completelyBareThreshold)
      .toBeLessThan(REALM_GRASS_BIOME_PROFILES.ridge.completelyBareThreshold);
    expect(REALM_GRASS_BIOME_PROFILES.lake.highCandidateCount).toBe(0);
    expect(REALM_GRASS_BIOME_PROFILES.lake.completelyBareThreshold).toBe(1);
  });
});
