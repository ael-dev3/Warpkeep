import {
  axialToWorld,
  hexDisc,
  hexKey,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import { sampleRealmGrassValueNoise } from './realmGrassNoise';
import type { RealmTerrainKind } from './realmTerrainSemantics';

/**
 * Pure presentation ecology derived from the persistent world seed and the
 * exact public terrain-kind projection. It never replaces terrain authority:
 * movement, passability, resources, and water remain owned by SpacetimeDB.
 */
export type RealmVegetationFieldSample = Readonly<{
  macro: number;
  meso: number;
  forestNeighbourShare: number;
  wetness: number;
  grassDensity: number;
  woodlandPotential: number;
}>;

export type RealmVegetationField = Readonly<{
  sample: (world: HexWorldPosition) => RealmVegetationFieldSample;
  sampleCell: (coord: HexCoord) => RealmVegetationFieldSample;
}>;

export type CreateRealmVegetationFieldOptions = Readonly<{
  worldSeed: number;
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>;
  playableKeys: ReadonlySet<string>;
  hexSize?: number;
  visualizeLegacyLakesAsLand?: boolean;
}>;

export const REALM_VEGETATION_FIELD_VERSION = 'realm-vegetation-field-v1';
export const REALM_VEGETATION_FIELD_WAVELENGTHS = Object.freeze({
  macro: 13.5,
  meso: 4.5,
  wetness: 8.25
});

const TERRAIN_GRASS_AFFINITY: Readonly<Record<RealmTerrainKind, number>> = Object.freeze({
  meadow: 1,
  lowland: 0.82,
  forest: 0.68,
  heath: 0.38,
  ridge: 0.08,
  lake: 0,
  'ancient-stone': 0.03
});

const TERRAIN_WOODLAND_AFFINITY: Readonly<Record<RealmTerrainKind, number>> = Object.freeze({
  forest: 1,
  lowland: 0.58,
  meadow: 0.42,
  heath: 0.08,
  ridge: 0,
  lake: 0,
  'ancient-stone': 0
});

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = clamp((value - edge0) / Math.max(0.000_1, edge1 - edge0));
  return normalized * normalized * (3 - normalized * 2);
}

function foliageKind(kind: RealmTerrainKind | undefined) {
  return kind === 'forest' || kind === 'lowland' || kind === 'meadow';
}

function forestNeighbourShare(
  coord: HexCoord,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  playableKeys: ReadonlySet<string>
) {
  let forestWeight = 0;
  let totalWeight = 0;
  hexDisc(coord, 2).forEach((candidate) => {
    const key = hexKey(candidate);
    if (!playableKeys.has(key)) return;
    const distance = Math.max(
      Math.abs(candidate.q - coord.q),
      Math.abs(candidate.r - coord.r),
      Math.abs((-candidate.q - candidate.r) - (-coord.q - coord.r))
    );
    const weight = distance === 0 ? 3 : distance === 1 ? 2 : 1;
    totalWeight += weight;
    if (terrainKindsByKey.get(key) === 'forest') forestWeight += weight;
  });
  return totalWeight === 0 ? 0 : forestWeight / totalWeight;
}

/**
 * Build one immutable sampling boundary per Realm scene. Cell-centre samples
 * are cached, while arbitrary point samples retain continuous macro/meso
 * fields so grass does not reveal hex-by-hex random density changes.
 */
export function createRealmVegetationField(
  options: CreateRealmVegetationFieldOptions
): RealmVegetationField {
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0
    ? options.hexSize!
    : 1;
  const worldSeed = options.worldSeed >>> 0;
  const cellCache = new Map<string, RealmVegetationFieldSample>();
  const forestNeighbourCache = new Map<string, number>();

  const sampleAt = (world: HexWorldPosition): RealmVegetationFieldSample => {
    const coord = worldToNearestAxial(world, hexSize);
    const key = hexKey(coord);
    const playable = options.playableKeys.has(key);
    const terrainKind = options.terrainKindsByKey.get(key);
    const macro = sampleRealmGrassValueNoise(
      worldSeed,
      world,
      REALM_VEGETATION_FIELD_WAVELENGTHS.macro,
      `${REALM_VEGETATION_FIELD_VERSION}:macro`
    );
    const meso = sampleRealmGrassValueNoise(
      worldSeed,
      world,
      REALM_VEGETATION_FIELD_WAVELENGTHS.meso,
      `${REALM_VEGETATION_FIELD_VERSION}:meso`
    );
    const wetness = sampleRealmGrassValueNoise(
      worldSeed,
      world,
      REALM_VEGETATION_FIELD_WAVELENGTHS.wetness,
      `${REALM_VEGETATION_FIELD_VERSION}:wetness`
    );
    if (!playable || terrainKind === undefined) {
      return Object.freeze({
        macro,
        meso,
        forestNeighbourShare: 0,
        wetness,
        grassDensity: 0,
        woodlandPotential: 0
      });
    }
    const cachedNeighbourShare = forestNeighbourCache.get(key);
    const neighbourShare = cachedNeighbourShare ?? forestNeighbourShare(
      coord,
      options.terrainKindsByKey,
      options.playableKeys
    );
    if (cachedNeighbourShare === undefined) forestNeighbourCache.set(key, neighbourShare);
    const visualTerrainKind = options.visualizeLegacyLakesAsLand && terrainKind === 'lake'
      ? 'lowland'
      : terrainKind;
    const grassAffinity = TERRAIN_GRASS_AFFINITY[visualTerrainKind];
    const woodlandAffinity = TERRAIN_WOODLAND_AFFINITY[visualTerrainKind];
    const broadGrass = smoothstep(0.16, 0.84, macro * 0.72 + meso * 0.28);
    const woodlandSignal = smoothstep(
      0.3,
      0.79,
      macro * 0.45 + meso * 0.2 + neighbourShare * 0.35
    );
    // Dense canopy shades its own forest floor without turning it bare. This
    // same signal also makes meadow/lowland fringes agree with nearby trees.
    const canopyShade = visualTerrainKind === 'forest' ? woodlandSignal * 0.24 : 0;
    const grassDensity = clamp(
      grassAffinity * (0.48 + broadGrass * 0.52) - canopyShade
    );
    const woodlandPotential = foliageKind(visualTerrainKind)
      ? clamp(woodlandAffinity * (0.34 + woodlandSignal * 0.66))
      : 0;
    return Object.freeze({
      macro,
      meso,
      forestNeighbourShare: neighbourShare,
      wetness,
      grassDensity,
      woodlandPotential
    });
  };

  return Object.freeze({
    sample: sampleAt,
    sampleCell: (coord) => {
      const key = hexKey(coord);
      const cached = cellCache.get(key);
      if (cached) return cached;
      const sample = sampleAt(axialToWorld(coord, hexSize));
      cellCache.set(key, sample);
      return sample;
    }
  });
}
