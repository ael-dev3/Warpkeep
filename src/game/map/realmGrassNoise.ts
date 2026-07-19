import { deriveChannelSeed, seededUnitFloat } from './realmSeed';
import type { HexWorldPosition } from './hexCoordinates';

export const REALM_GRASS_NOISE_CHANNELS = Object.freeze({
  macro: 'realm-grass-macro-coverage-v1',
  meso: 'realm-grass-meso-coverage-v1'
});

export const REALM_GRASS_NOISE_WAVELENGTHS = Object.freeze({
  macro: 6.75,
  meso: 2.35
});

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(value: number) {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - normalized * 2);
}

function latticeValue(worldSeed: number, x: number, z: number, channel: string) {
  return seededUnitFloat(deriveChannelSeed(worldSeed, x, z, channel));
}

/**
 * Smooth dependency-free world-space value noise. Its channel is deliberately
 * explicit so coverage fields cannot accidentally become coupled as the visual
 * layer evolves. This module has no renderer, clock, or browser dependency.
 */
export function sampleRealmGrassValueNoise(
  worldSeed: number,
  world: HexWorldPosition,
  wavelength: number,
  channel: string
) {
  const safeWavelength = Number.isFinite(wavelength) && wavelength > 0
    ? wavelength
    : 1;
  const x = (Number.isFinite(world.x) ? world.x : 0) / safeWavelength;
  const z = (Number.isFinite(world.z) ? world.z : 0) / safeWavelength;
  const baseX = Math.floor(x);
  const baseZ = Math.floor(z);
  const blendX = smoothstep(x - baseX);
  const blendZ = smoothstep(z - baseZ);
  const lower = latticeValue(worldSeed, baseX, baseZ, channel) * (1 - blendX)
    + latticeValue(worldSeed, baseX + 1, baseZ, channel) * blendX;
  const upper = latticeValue(worldSeed, baseX, baseZ + 1, channel) * (1 - blendX)
    + latticeValue(worldSeed, baseX + 1, baseZ + 1, channel) * blendX;
  return lower * (1 - blendZ) + upper * blendZ;
}

export type RealmGrassCoverage = Readonly<{
  macro: number;
  meso: number;
}>;

export function sampleRealmGrassCoverage(
  worldSeed: number,
  world: HexWorldPosition
): RealmGrassCoverage {
  return Object.freeze({
    macro: sampleRealmGrassValueNoise(
      worldSeed,
      world,
      REALM_GRASS_NOISE_WAVELENGTHS.macro,
      REALM_GRASS_NOISE_CHANNELS.macro
    ),
    meso: sampleRealmGrassValueNoise(
      worldSeed,
      world,
      REALM_GRASS_NOISE_WAVELENGTHS.meso,
      REALM_GRASS_NOISE_CHANNELS.meso
    )
  });
}
