import * as THREE from 'three';

import type { HegemonyKeepPrefabPrimitive } from './hegemonyKeepPrefabRepository';

export type RealmCastleRoofProjectionSample = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type RealmCastleProjectionPlacement = Readonly<{
  x: number;
  renderY: number;
  z: number;
}>;

export const MAX_CASTLE_ROOF_PROJECTION_SAMPLES = 48;

const ROOF_GRID_DIVISIONS = 6;
const SUPPORT_PITCH_SAMPLES = 5;
const SUPPORT_DEPTH_BIASES = [-0.2, -0.1, 0, 0.1, 0.2] as const;

type MutableSample = { x: number; y: number; z: number };

function radians(degrees: number) {
  return degrees * Math.PI / 180;
}

function finitePoint(point: RealmCastleRoofProjectionSample) {
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z);
}

function supportDirections(
  azimuthDegrees: number,
  minimumPitchDegrees: number,
  maximumPitchDegrees: number
) {
  const azimuth = radians(azimuthDegrees);
  const directions: THREE.Vector3[] = [];
  for (let index = 0; index < SUPPORT_PITCH_SAMPLES; index += 1) {
    const amount = index / (SUPPORT_PITCH_SAMPLES - 1);
    const pitch = radians(
      minimumPitchDegrees + (maximumPitchDegrees - minimumPitchDegrees) * amount
    );
    const up = new THREE.Vector3(
      -Math.sin(azimuth) * Math.sin(pitch),
      Math.cos(pitch),
      -Math.cos(azimuth) * Math.sin(pitch)
    );
    const forward = new THREE.Vector3(
      -Math.sin(azimuth) * Math.cos(pitch),
      -Math.sin(pitch),
      -Math.cos(azimuth) * Math.cos(pitch)
    );
    SUPPORT_DEPTH_BIASES.forEach((bias) => {
      directions.push(up.clone().addScaledVector(forward, -bias).normalize());
    });
  }
  return directions;
}

function visitPrefabVertices(
  primitives: readonly HegemonyKeepPrefabPrimitive[],
  visitor: (point: THREE.Vector3) => void
) {
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  primitives.forEach((primitive) => {
    const position = primitive.geometry.getAttribute('position');
    if (!position) return;
    matrix.fromArray(primitive.localMatrixElements);
    for (let index = 0; index < position.count; index += 1) {
      point
        .set(position.getX(index), position.getY(index), position.getZ(index))
        .applyMatrix4(matrix);
      if (finitePoint(point)) visitor(point);
    }
  });
}

function sampleKey(sample: RealmCastleRoofProjectionSample) {
  return `${sample.x.toPrecision(12)}:${sample.y.toPrecision(12)}:${sample.z.toPrecision(12)}`;
}

/**
 * Reduces the loaded GLB geometry once to a fixed-size upper-envelope sample.
 * Directional supports preserve perspective extrema across the Realm camera's
 * pitch range; spatial roof maxima retain irregular towers and battlements.
 */
export function deriveCastleRoofProjectionSamples(
  primitives: readonly HegemonyKeepPrefabPrimitive[],
  options: Readonly<{
    azimuthDegrees: number;
    minimumPitchDegrees: number;
    maximumPitchDegrees: number;
    maximumSamples?: number;
  }>
): readonly RealmCastleRoofProjectionSample[] {
  const maximumSamples = Number.isFinite(options.maximumSamples)
    ? Math.max(1, Math.min(
        MAX_CASTLE_ROOF_PROJECTION_SAMPLES,
        Math.floor(options.maximumSamples ?? MAX_CASTLE_ROOF_PROJECTION_SAMPLES)
      ))
    : MAX_CASTLE_ROOF_PROJECTION_SAMPLES;
  const bounds = new THREE.Box3();
  let vertexCount = 0;
  visitPrefabVertices(primitives, (point) => {
    bounds.expandByPoint(point);
    vertexCount += 1;
  });
  if (vertexCount === 0 || bounds.isEmpty()) return [];

  const directions = supportDirections(
    options.azimuthDegrees,
    Math.min(options.minimumPitchDegrees, options.maximumPitchDegrees),
    Math.max(options.minimumPitchDegrees, options.maximumPitchDegrees)
  );
  const supportScores = directions.map(() => Number.NEGATIVE_INFINITY);
  const supportPoints: Array<MutableSample | undefined> = directions.map(() => undefined);
  const gridPoints: Array<MutableSample | undefined> = Array.from({
    length: ROOF_GRID_DIVISIONS * ROOF_GRID_DIVISIONS
  });
  const width = Math.max(Number.EPSILON, bounds.max.x - bounds.min.x);
  const depth = Math.max(Number.EPSILON, bounds.max.z - bounds.min.z);

  visitPrefabVertices(primitives, (point) => {
    directions.forEach((direction, index) => {
      const score = point.dot(direction);
      if (score > supportScores[index]) {
        supportScores[index] = score;
        supportPoints[index] = { x: point.x, y: point.y, z: point.z };
      }
    });

    const column = Math.min(
      ROOF_GRID_DIVISIONS - 1,
      Math.max(0, Math.floor(
        (point.x - bounds.min.x) / width * ROOF_GRID_DIVISIONS
      ))
    );
    const row = Math.min(
      ROOF_GRID_DIVISIONS - 1,
      Math.max(0, Math.floor(
        (point.z - bounds.min.z) / depth * ROOF_GRID_DIVISIONS
      ))
    );
    const gridIndex = row * ROOF_GRID_DIVISIONS + column;
    const existing = gridPoints[gridIndex];
    if (!existing || point.y > existing.y) {
      gridPoints[gridIndex] = { x: point.x, y: point.y, z: point.z };
    }
  });

  const samples: RealmCastleRoofProjectionSample[] = [];
  const seen = new Set<string>();
  for (const sample of [...supportPoints, ...gridPoints]) {
    if (!sample) continue;
    const key = sampleKey(sample);
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(Object.freeze({ ...sample }));
    if (samples.length >= maximumSamples) break;
  }
  return Object.freeze(samples);
}

/** Projects only the fixed roof envelope generated at model-load time. */
export function projectCastleRoofScreenTop(
  samples: readonly RealmCastleRoofProjectionSample[],
  placement: RealmCastleProjectionPlacement,
  camera: THREE.Camera,
  viewportHeight: number,
  scratch = new THREE.Vector3()
) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return undefined;
  let top = Number.POSITIVE_INFINITY;
  const sampleCount = Math.min(samples.length, MAX_CASTLE_ROOF_PROJECTION_SAMPLES);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = samples[index];
    if (!sample) continue;
    if (!finitePoint(sample)) continue;
    scratch
      .set(
        placement.x + sample.x,
        placement.renderY + sample.y,
        placement.z + sample.z
      )
      .project(camera);
    const y = (-scratch.y * 0.5 + 0.5) * viewportHeight;
    if (Number.isFinite(y)) top = Math.min(top, y);
  }
  return Number.isFinite(top) ? top : undefined;
}
