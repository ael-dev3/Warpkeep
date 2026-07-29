import {
  axialToWorld,
  worldToFractionalAxial,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import { sampleRealmGrassValueNoise } from './realmGrassNoise';
import { REALM_PREVAILING_WIND } from './realmPrevailingWind';

export const REALM_SOUTHERN_DESERT_FIELD_REVISION =
  'genesis-001-southern-desert-presentation-v1';

const DESERT_NOISE_CHANNELS = Object.freeze({
  macro: 'realm-southern-desert-macro-v1',
  meso: 'realm-southern-desert-meso-v1',
  exposure: 'realm-southern-desert-exposure-v1'
});

export type RealmSouthernDesertSample = Readonly<{
  climate: number;
  exposure: number;
  sand: number;
}>;

export type RealmSouthernDesertRetentionCues = Readonly<{
  slope: number;
  concavity: number;
  vegetation: number;
  canopy: number;
  wetness: number;
  semanticRetention: number;
  placementInfluence: number;
}>;

export type RealmSouthernDesertField = Readonly<{
  revision: typeof REALM_SOUTHERN_DESERT_FIELD_REVISION;
  worldSeed: number;
  hexSize: number;
  playableRadius: number;
  renderRadius: number;
  sampleWorld: (world: HexWorldPosition) => RealmSouthernDesertSample;
  sampleCoord: (coord: HexCoord) => RealmSouthernDesertSample;
  sandAtWorld: (world: HexWorldPosition) => number;
  retainedSandAtWorld: (
    world: HexWorldPosition,
    cues: RealmSouthernDesertRetentionCues
  ) => number;
}>;

export type RealmSouthernDesertCoverageSummary = Readonly<{
  climateCellCountAbove015: number;
  deepCellCountAbove075: number;
  playableCoverageRatio: number;
  deepCoverageRatio: number;
  innerRadiusLeakCount: number;
  northernLeakCount: number;
  southernmostRowMean: number;
  snowOverlapCellCount: number;
}>;

export type CreateRealmSouthernDesertFieldOptions = Readonly<{
  worldSeed: number;
  hexSize: number;
  playableRadius: number;
  renderRadius: number;
}>;

type SnowCoverageSampler = Readonly<{
  coverageAtWorld: (world: HexWorldPosition) => number;
}>;

const ZERO_DESERT_SAMPLE = Object.freeze({
  climate: 0,
  exposure: 0,
  sand: 0
}) satisfies RealmSouthernDesertSample;

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const progress = clampUnit((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

function finiteWorld(world: HexWorldPosition) {
  return Number.isFinite(world.x) && Number.isFinite(world.z);
}

function validOptions(options: CreateRealmSouthernDesertFieldOptions) {
  return (
    Number.isSafeInteger(options.worldSeed)
    && Number.isFinite(options.hexSize)
    && options.hexSize > 0
    && Number.isSafeInteger(options.playableRadius)
    && options.playableRadius >= 1
    && Number.isSafeInteger(options.renderRadius)
    && options.renderRadius >= options.playableRadius
  );
}

function evaluateDesert(
  options: CreateRealmSouthernDesertFieldOptions,
  world: HexWorldPosition,
  mode: 'sample'
): RealmSouthernDesertSample;
function evaluateDesert(
  options: CreateRealmSouthernDesertFieldOptions,
  world: HexWorldPosition,
  mode: 'sand'
): number;
function evaluateDesert(
  options: CreateRealmSouthernDesertFieldOptions,
  world: HexWorldPosition,
  mode: 'retained',
  cues: RealmSouthernDesertRetentionCues
): number;
function evaluateDesert(
  options: CreateRealmSouthernDesertFieldOptions,
  world: HexWorldPosition,
  mode: 'sample' | 'sand' | 'retained',
  cues?: RealmSouthernDesertRetentionCues
): RealmSouthernDesertSample | number {
  if (!finiteWorld(world)) {
    return mode === 'sample' ? ZERO_DESERT_SAMPLE : 0;
  }

  const axial = worldToFractionalAxial(world, options.hexSize);
  const radial = Math.max(Math.abs(axial.q), Math.abs(axial.r), Math.abs(axial.s));
  const south = axial.r / options.playableRadius;
  const wavelengthScale = options.hexSize;
  const macro = sampleRealmGrassValueNoise(
    options.worldSeed,
    world,
    wavelengthScale * 19.25,
    DESERT_NOISE_CHANNELS.macro
  );
  const meso = sampleRealmGrassValueNoise(
    options.worldSeed,
    world,
    wavelengthScale * 8.7,
    DESERT_NOISE_CHANNELS.meso
  );
  const exposureNoise = sampleRealmGrassValueNoise(
    options.worldSeed,
    {
      x: world.x - REALM_PREVAILING_WIND.x * wavelengthScale * 4.75,
      z: world.z - REALM_PREVAILING_WIND.z * wavelengthScale * 4.75
    },
    wavelengthScale * 13.25,
    DESERT_NOISE_CHANNELS.exposure
  );

  const protectedOuterMask = smoothstep(
    options.playableRadius * 0.31,
    options.playableRadius * 0.39,
    radial
  );
  const wanderingSouth = south
    + (macro - 0.5) * 0.21
    + (meso - 0.5) * 0.09;
  const climate = clampUnit(
    smoothstep(0.31, 0.735, wanderingSouth) * protectedOuterMask
  );
  const windCoordinate = (
    world.x * REALM_PREVAILING_WIND.x
    + world.z * REALM_PREVAILING_WIND.z
  ) / Math.max(options.hexSize, 0.000_001);
  const windBand = 0.5 + Math.sin(windCoordinate * 0.16 + 0.9) * 0.5;
  const exposure = clampUnit(
    exposureNoise * 0.67
    + windBand * 0.23
    + meso * 0.10
  );
  const sand = clampUnit(
    climate
    - exposure * climate * (0.04 + (1 - climate) * 0.065)
    + (macro - 0.5) * climate * 0.05
  );

  if (mode === 'sample') return Object.freeze({ climate, exposure, sand });
  if (mode === 'sand') return sand;

  const slopeValue = cues?.slope;
  const concavityValue = cues?.concavity;
  const vegetationValue = cues?.vegetation;
  const canopyValue = cues?.canopy;
  const wetnessValue = cues?.wetness;
  const semanticsValue = cues?.semanticRetention;
  const placementValue = cues?.placementInfluence;
  const slope = clampUnit(Number.isFinite(slopeValue) ? slopeValue! : 1);
  const concavity = Math.min(
    1,
    Math.max(-1, Number.isFinite(concavityValue) ? concavityValue! : 0)
  );
  const vegetation = clampUnit(
    Number.isFinite(vegetationValue) ? vegetationValue! : 1
  );
  const canopy = clampUnit(Number.isFinite(canopyValue) ? canopyValue! : 1);
  const wetness = clampUnit(Number.isFinite(wetnessValue) ? wetnessValue! : 1);
  const semanticRetention = clampUnit(
    Number.isFinite(semanticsValue) ? semanticsValue! : 0
  );
  const placement = clampUnit(
    Number.isFinite(placementValue) ? placementValue! : 1
  );
  const hollow = Math.max(0, concavity);
  const crest = Math.max(0, -concavity);
  const retained = sand
    * semanticRetention
    * (1 - vegetation * 0.29)
    * (1 - canopy * 0.26)
    * (1 - wetness * 0.16)
    - slope * sand * 0.33
    + hollow * sand * 0.10
    - crest * sand * 0.07
    - exposure * sand * 0.08;
  return clampUnit(retained * (1 - placement * 0.90));
}

export function createRealmSouthernDesertField(
  options: CreateRealmSouthernDesertFieldOptions
): RealmSouthernDesertField {
  if (!validOptions(options)) {
    throw new RangeError('REALM_SOUTHERN_DESERT_FIELD_OPTIONS_INVALID');
  }
  const fixed = Object.freeze({ ...options });
  return Object.freeze({
    revision: REALM_SOUTHERN_DESERT_FIELD_REVISION,
    worldSeed: fixed.worldSeed,
    hexSize: fixed.hexSize,
    playableRadius: fixed.playableRadius,
    renderRadius: fixed.renderRadius,
    sampleWorld: (world) => evaluateDesert(fixed, world, 'sample'),
    sampleCoord: (coord) => evaluateDesert(
      fixed,
      axialToWorld(coord, fixed.hexSize),
      'sample'
    ),
    sandAtWorld: (world) => evaluateDesert(fixed, world, 'sand'),
    retainedSandAtWorld: (world, cues) => evaluateDesert(
      fixed,
      world,
      'retained',
      cues
    )
  });
}

export function summarizeRealmSouthernDesertCoverage(
  field: RealmSouthernDesertField,
  visibleLandCoords: readonly HexCoord[],
  snow?: SnowCoverageSampler
): RealmSouthernDesertCoverageSummary {
  let climateCellCountAbove015 = 0;
  let deepCellCountAbove075 = 0;
  let innerRadiusLeakCount = 0;
  let northernLeakCount = 0;
  let snowOverlapCellCount = 0;
  let southernmostR = Number.NEGATIVE_INFINITY;
  let southernmostRowSandNano = 0;
  let southernmostRowCount = 0;

  for (const coord of visibleLandCoords) {
    if (!Number.isSafeInteger(coord.q) || !Number.isSafeInteger(coord.r)) continue;
    const world = axialToWorld(coord, field.hexSize);
    const sand = field.sandAtWorld(world);
    const radial = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(-coord.q - coord.r));
    if (sand > 0.15) climateCellCountAbove015 += 1;
    if (sand > 0.75) deepCellCountAbove075 += 1;
    if (radial <= 18 && sand > 0.15) innerRadiusLeakCount += 1;
    if (coord.r < 0 && sand > 0.01) northernLeakCount += 1;
    if (snow && sand > 0.15 && snow.coverageAtWorld(world) > 0.15) {
      snowOverlapCellCount += 1;
    }
    if (coord.r > southernmostR) {
      southernmostR = coord.r;
      southernmostRowSandNano = Math.round(sand * 1_000_000_000);
      southernmostRowCount = 1;
    } else if (coord.r === southernmostR) {
      southernmostRowSandNano += Math.round(sand * 1_000_000_000);
      southernmostRowCount += 1;
    }
  }

  const denominator = Math.max(1, visibleLandCoords.length);
  return Object.freeze({
    climateCellCountAbove015,
    deepCellCountAbove075,
    playableCoverageRatio: climateCellCountAbove015 / denominator,
    deepCoverageRatio: deepCellCountAbove075 / denominator,
    innerRadiusLeakCount,
    northernLeakCount,
    southernmostRowMean:
      southernmostRowSandNano / (Math.max(1, southernmostRowCount) * 1_000_000_000),
    snowOverlapCellCount
  });
}

