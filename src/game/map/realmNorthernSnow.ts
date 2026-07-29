import {
  axialToWorld,
  worldToFractionalAxial,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import { sampleRealmGrassValueNoise } from './realmGrassNoise';
import { REALM_PREVAILING_WIND } from './realmPrevailingWind';

export const REALM_NORTHERN_SNOW_FIELD_REVISION =
  'genesis-001-northern-snow-presentation-v1';

const SNOW_NOISE_CHANNELS = Object.freeze({
  macro: 'realm-northern-snow-macro-v1',
  meso: 'realm-northern-snow-meso-v1',
  exposure: 'realm-northern-snow-exposure-v1'
});

export type RealmNorthernSnowSample = Readonly<{
  climate: number;
  exposure: number;
  coverage: number;
}>;

export type RealmNorthernSnowRetentionCues = Readonly<{
  slope: number;
  concavity: number;
  placementInfluence: number;
}>;

export type RealmNorthernSnowField = Readonly<{
  revision: typeof REALM_NORTHERN_SNOW_FIELD_REVISION;
  worldSeed: number;
  hexSize: number;
  playableRadius: number;
  renderRadius: number;
  sampleWorld: (world: HexWorldPosition) => RealmNorthernSnowSample;
  sampleCoord: (coord: HexCoord) => RealmNorthernSnowSample;
  coverageAtWorld: (world: HexWorldPosition) => number;
  retainedCoverageAtWorld: (
    world: HexWorldPosition,
    cues: RealmNorthernSnowRetentionCues
  ) => number;
}>;

export type RealmNorthernSnowCoverageSummary = Readonly<{
  climateCellCountAbove015: number;
  deepCellCountAbove075: number;
  playableCoverageRatio: number;
  deepCoverageRatio: number;
  innerRadiusLeakCount: number;
  northernmostRowMean: number;
  southernLeakCount: number;
}>;

export type CreateRealmNorthernSnowFieldOptions = Readonly<{
  worldSeed: number;
  hexSize: number;
  playableRadius: number;
  renderRadius: number;
}>;

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const progress = clampUnit((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

function finiteWorld(world: HexWorldPosition) {
  return Number.isFinite(world.x) && Number.isFinite(world.z);
}

function validOptions(options: CreateRealmNorthernSnowFieldOptions) {
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

const ZERO_SNOW_SAMPLE = Object.freeze({
  climate: 0,
  exposure: 0,
  coverage: 0
}) satisfies RealmNorthernSnowSample;

function evaluateSnow(
  options: CreateRealmNorthernSnowFieldOptions,
  world: HexWorldPosition,
  mode: 'sample'
): RealmNorthernSnowSample;
function evaluateSnow(
  options: CreateRealmNorthernSnowFieldOptions,
  world: HexWorldPosition,
  mode: 'coverage'
): number;
function evaluateSnow(
  options: CreateRealmNorthernSnowFieldOptions,
  world: HexWorldPosition,
  mode: 'retained',
  cues: RealmNorthernSnowRetentionCues
): number;
function evaluateSnow(
  options: CreateRealmNorthernSnowFieldOptions,
  world: HexWorldPosition,
  mode: 'sample' | 'coverage' | 'retained',
  cues?: RealmNorthernSnowRetentionCues
): RealmNorthernSnowSample | number {
  if (!finiteWorld(world)) {
    return mode === 'sample' ? ZERO_SNOW_SAMPLE : 0;
  }

  const axial = worldToFractionalAxial(world, options.hexSize);
  const radial = Math.max(Math.abs(axial.q), Math.abs(axial.r), Math.abs(axial.s));
  const north = -axial.r / options.playableRadius;
  const wavelengthScale = options.hexSize;
  const macro = sampleRealmGrassValueNoise(
    options.worldSeed,
    world,
    wavelengthScale * 18.5,
    SNOW_NOISE_CHANNELS.macro
  );
  const meso = sampleRealmGrassValueNoise(
    options.worldSeed,
    world,
    wavelengthScale * 8.25,
    SNOW_NOISE_CHANNELS.meso
  );
  const exposureNoise = sampleRealmGrassValueNoise(
    options.worldSeed,
    {
      x: world.x + REALM_PREVAILING_WIND.x * wavelengthScale * 5.5,
      z: world.z + REALM_PREVAILING_WIND.z * wavelengthScale * 5.5
    },
    wavelengthScale * 12.75,
    SNOW_NOISE_CHANNELS.exposure
  );

  const protectedOuterMask = smoothstep(
    options.playableRadius * 0.31,
    options.playableRadius * 0.39,
    radial
  );
  const wanderingNorth = north
    + (macro - 0.5) * 0.21
    + (meso - 0.5) * 0.09;
  const climate = clampUnit(
    smoothstep(0.31, 0.735, wanderingNorth) * protectedOuterMask
  );
  const windCoordinate = (
    world.x * REALM_PREVAILING_WIND.x
    + world.z * REALM_PREVAILING_WIND.z
  ) / Math.max(options.hexSize, 0.000_001);
  const windBand = 0.5 + Math.sin(windCoordinate * 0.18) * 0.5;
  const exposure = clampUnit(
    exposureNoise * 0.68
    + windBand * 0.22
    + meso * 0.10
  );
  const coverage = clampUnit(
    climate
    - exposure * climate * (0.045 + (1 - climate) * 0.075)
    + (macro - 0.5) * climate * 0.045
  );

  if (mode === 'sample') {
    return Object.freeze({ climate, exposure, coverage });
  }
  if (mode === 'coverage') return coverage;

  const slopeValue = cues?.slope;
  const concavityValue = cues?.concavity;
  const placementValue = cues?.placementInfluence;
  const slope = clampUnit(Number.isFinite(slopeValue) ? slopeValue! : 1);
  const concavity = Math.min(
    1,
    Math.max(-1, Number.isFinite(concavityValue) ? concavityValue! : 0)
  );
  const placement = clampUnit(
    Number.isFinite(placementValue) ? placementValue! : 1
  );
  const hollow = Math.max(0, concavity);
  const crest = Math.max(0, -concavity);
  const retained = coverage
    - slope * coverage * 0.52
    + hollow * coverage * 0.15
    - crest * coverage * 0.09
    - exposure * coverage * 0.09;
  return clampUnit(retained * (1 - placement * 0.92));
}

export function createRealmNorthernSnowField(
  options: CreateRealmNorthernSnowFieldOptions
): RealmNorthernSnowField {
  if (!validOptions(options)) {
    throw new RangeError('REALM_NORTHERN_SNOW_FIELD_OPTIONS_INVALID');
  }
  const fixed = Object.freeze({ ...options });

  const field: RealmNorthernSnowField = {
    revision: REALM_NORTHERN_SNOW_FIELD_REVISION,
    worldSeed: fixed.worldSeed,
    hexSize: fixed.hexSize,
    playableRadius: fixed.playableRadius,
    renderRadius: fixed.renderRadius,
    sampleWorld: (world) => evaluateSnow(fixed, world, 'sample'),
    sampleCoord: (coord) => evaluateSnow(
      fixed,
      axialToWorld(coord, fixed.hexSize),
      'sample'
    ),
    coverageAtWorld: (world) => evaluateSnow(fixed, world, 'coverage'),
    retainedCoverageAtWorld: (world, cues) => evaluateSnow(
      fixed,
      world,
      'retained',
      cues
    )
  };
  return Object.freeze(field);
}

export function summarizeRealmNorthernSnowCoverage(
  field: RealmNorthernSnowField,
  visibleLandCoords: readonly HexCoord[]
): RealmNorthernSnowCoverageSummary {
  let climateCellCountAbove015 = 0;
  let deepCellCountAbove075 = 0;
  let innerRadiusLeakCount = 0;
  let southernLeakCount = 0;
  let northernmostR = Number.POSITIVE_INFINITY;
  let northernmostRowCoverageNano = 0;
  let northernmostRowCount = 0;

  for (const coord of visibleLandCoords) {
    if (!Number.isSafeInteger(coord.q) || !Number.isSafeInteger(coord.r)) continue;
    const coverage = field.coverageAtWorld(axialToWorld(coord, field.hexSize));
    const radial = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(-coord.q - coord.r));
    if (coverage > 0.15) climateCellCountAbove015 += 1;
    if (coverage > 0.75) deepCellCountAbove075 += 1;
    if (radial <= 18 && coverage > 0.15) innerRadiusLeakCount += 1;
    if (coord.r > 0 && coverage > 0.01) southernLeakCount += 1;
    if (coord.r < northernmostR) {
      northernmostR = coord.r;
      northernmostRowCoverageNano = Math.round(coverage * 1_000_000_000);
      northernmostRowCount = 1;
    } else if (coord.r === northernmostR) {
      northernmostRowCoverageNano += Math.round(coverage * 1_000_000_000);
      northernmostRowCount += 1;
    }
  }

  const denominator = Math.max(1, visibleLandCoords.length);
  return Object.freeze({
    climateCellCountAbove015,
    deepCellCountAbove075,
    playableCoverageRatio: climateCellCountAbove015 / denominator,
    deepCoverageRatio: deepCellCountAbove075 / denominator,
    innerRadiusLeakCount,
    northernmostRowMean:
      northernmostRowCoverageNano / (Math.max(1, northernmostRowCount) * 1_000_000_000),
    southernLeakCount
  });
}
