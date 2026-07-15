import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

import type { HegemonyKeepPrefabPrimitive } from './hegemonyKeepPrefabRepository';

export type RealmCastleProjectionSample = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type RealmCastleRoofProjectionSample = RealmCastleProjectionSample;

export type RealmCastleProjectionLocalBounds = Readonly<{
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}>;

export type RealmCastleProjectionEnvelope = Readonly<{
  /** Exact convex hull when bounded; otherwise a containing eight-corner AABB. */
  mode: 'convex-hull' | 'axis-aligned-bounds';
  localBounds: RealmCastleProjectionLocalBounds;
  samples: readonly RealmCastleProjectionSample[];
}>;

const TRUSTED_CASTLE_PROJECTION_ENVELOPES = new WeakSet<object>();

function freezeTrustedProjectionEnvelope(
  envelope: RealmCastleProjectionEnvelope
): RealmCastleProjectionEnvelope {
  const frozen = Object.freeze(envelope);
  TRUSTED_CASTLE_PROJECTION_ENVELOPES.add(frozen);
  return frozen;
}

export type RealmCastleScreenBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type RealmCastleProjectionPlacement = Readonly<{
  x: number;
  renderY: number;
  z: number;
}>;

export const MAX_CASTLE_ROOF_PROJECTION_SAMPLES = 48;
export const MAX_CASTLE_SILHOUETTE_PROJECTION_SAMPLES = 512;

const ROOF_GRID_DIVISIONS = 6;
const SUPPORT_PITCH_SAMPLES = 5;
const SUPPORT_DEPTH_BIASES = [-0.2, -0.1, 0, 0.1, 0.2] as const;

type MutableSample = { x: number; y: number; z: number };

/**
 * A keep is screen-visible when any positive-area part of its projected
 * envelope intersects the canvas. The roof anchor may already be outside the
 * viewport during an edge pan, so it must never be the visibility authority.
 */
export function castleSilhouetteIntersectsViewport(
  bounds: RealmCastleScreenBounds | undefined,
  viewportWidth: number,
  viewportHeight: number
) {
  return bounds !== undefined
    && Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.right)
    && Number.isFinite(bounds.bottom)
    && bounds.right > bounds.left
    && bounds.bottom > bounds.top
    && Number.isFinite(viewportWidth)
    && viewportWidth > 0
    && Number.isFinite(viewportHeight)
    && viewportHeight > 0
    && bounds.right > 0
    && bounds.left < viewportWidth
    && bounds.bottom > 0
    && bounds.top < viewportHeight;
}

function radians(degrees: number) {
  return degrees * Math.PI / 180;
}

function finitePoint(point: RealmCastleRoofProjectionSample) {
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z);
}

function validLocalBounds(bounds: RealmCastleProjectionLocalBounds) {
  return Number.isFinite(bounds.minX)
    && Number.isFinite(bounds.minY)
    && Number.isFinite(bounds.minZ)
    && Number.isFinite(bounds.maxX)
    && Number.isFinite(bounds.maxY)
    && Number.isFinite(bounds.maxZ)
    && bounds.maxX > bounds.minX
    && bounds.maxY > bounds.minY
    && bounds.maxZ > bounds.minZ;
}

function freezeLocalBounds(
  bounds: THREE.Box3
): RealmCastleProjectionLocalBounds | undefined {
  const result = Object.freeze({
    minX: bounds.min.x,
    minY: bounds.min.y,
    minZ: bounds.min.z,
    maxX: bounds.max.x,
    maxY: bounds.max.y,
    maxZ: bounds.max.z
  });
  return validLocalBounds(result) ? result : undefined;
}

function freezeSample(point: RealmCastleProjectionSample): RealmCastleProjectionSample {
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}

function axisAlignedBoundsSamples(
  bounds: RealmCastleProjectionLocalBounds
): readonly RealmCastleProjectionSample[] {
  const samples: RealmCastleProjectionSample[] = [];
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [bounds.minY, bounds.maxY]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        samples.push(freezeSample({ x, y, z }));
      }
    }
  }
  return Object.freeze(samples);
}

/**
 * Constructs the fail-closed projection envelope used before a prefab is
 * available and whenever an exact hull cannot be trusted.
 */
export function createCastleBoundsProjectionEnvelope(
  bounds: RealmCastleProjectionLocalBounds
): RealmCastleProjectionEnvelope | undefined {
  if (!validLocalBounds(bounds)) return undefined;
  const localBounds = Object.freeze({ ...bounds });
  return freezeTrustedProjectionEnvelope({
    mode: 'axis-aligned-bounds' as const,
    localBounds,
    samples: axisAlignedBoundsSamples(localBounds)
  });
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

function hullSamplesContainBounds(
  samples: readonly RealmCastleProjectionSample[],
  bounds: RealmCastleProjectionLocalBounds
) {
  const hullBounds = new THREE.Box3();
  samples.forEach((sample) => hullBounds.expandByPoint(sample));
  if (hullBounds.isEmpty()) return false;
  const scale = Math.max(
    1,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ
  );
  const tolerance = scale * 1e-7;
  return hullBounds.min.x <= bounds.minX + tolerance
    && hullBounds.min.y <= bounds.minY + tolerance
    && hullBounds.min.z <= bounds.minZ + tolerance
    && hullBounds.max.x >= bounds.maxX - tolerance
    && hullBounds.max.y >= bounds.maxY - tolerance
    && hullBounds.max.z >= bounds.maxZ - tolerance;
}

/**
 * Reduces one normalized prefab to the vertices of its exact 3D convex hull.
 * Projective extrema of geometry wholly in front of the camera occur on this
 * hull. If the hull is malformed or exceeds the fixed runtime budget, the
 * containing local AABB is retained instead; samples are never truncated.
 */
export function deriveCastleProjectionEnvelope(
  primitives: readonly HegemonyKeepPrefabPrimitive[],
  options: Readonly<{ maximumHullVertices?: number }> = {}
): RealmCastleProjectionEnvelope | undefined {
  const maximumHullVertices = Number.isFinite(options.maximumHullVertices)
    ? Math.max(4, Math.min(
        MAX_CASTLE_SILHOUETTE_PROJECTION_SAMPLES,
        Math.floor(options.maximumHullVertices ?? MAX_CASTLE_SILHOUETTE_PROJECTION_SAMPLES)
      ))
    : MAX_CASTLE_SILHOUETTE_PROJECTION_SAMPLES;
  const points: THREE.Vector3[] = [];
  const bounds = new THREE.Box3();
  visitPrefabVertices(primitives, (point) => {
    const ownedPoint = point.clone();
    points.push(ownedPoint);
    bounds.expandByPoint(ownedPoint);
  });
  const localBounds = freezeLocalBounds(bounds);
  if (!localBounds) return undefined;
  const fallback = createCastleBoundsProjectionEnvelope(localBounds)!;
  if (points.length < 4) return fallback;

  try {
    const hull = new ConvexHull().setFromPoints(points);
    const samples: RealmCastleProjectionSample[] = [];
    const seen = new Set<string>();
    for (const face of hull.faces) {
      let edge = face.edge;
      do {
        const point = edge.head().point;
        if (!finitePoint(point)) return fallback;
        const key = sampleKey(point);
        if (!seen.has(key)) {
          seen.add(key);
          samples.push(freezeSample(point));
          if (samples.length > maximumHullVertices) return fallback;
        }
        edge = edge.next;
      } while (edge !== face.edge);
    }
    if (
      samples.length < 4
      || !hullSamplesContainBounds(samples, localBounds)
    ) return fallback;
    return freezeTrustedProjectionEnvelope({
      mode: 'convex-hull' as const,
      localBounds,
      samples: Object.freeze(samples)
    });
  } catch {
    return fallback;
  }
}

function trustedProjectionSamples(envelope: RealmCastleProjectionEnvelope) {
  if (
    TRUSTED_CASTLE_PROJECTION_ENVELOPES.has(envelope)
    && ((envelope.mode === 'convex-hull' && envelope.samples.length >= 4)
      || (envelope.mode === 'axis-aligned-bounds' && envelope.samples.length === 8))
    && envelope.samples.length <= MAX_CASTLE_SILHOUETTE_PROJECTION_SAMPLES
  ) return envelope.samples;
  return axisAlignedBoundsSamples(envelope.localBounds);
}

function projectSamplesToScreenBounds(
  samples: readonly RealmCastleProjectionSample[],
  placement: RealmCastleProjectionPlacement,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  scratch: THREE.Vector3
): RealmCastleScreenBounds | undefined {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    if (!finitePoint(sample)) return undefined;
    scratch
      .set(
        placement.x + sample.x,
        placement.renderY + sample.y,
        placement.z + sample.z
      )
      .project(camera);
    const x = (scratch.x * 0.5 + 0.5) * viewportWidth;
    const y = (-scratch.y * 0.5 + 0.5) * viewportHeight;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return right > left && bottom > top
    ? { left, top, right, bottom }
    : undefined;
}

/** Projects a bounded hull, or its containing AABB fallback, to screen space. */
export function projectCastleSilhouetteScreenBounds(
  envelope: RealmCastleProjectionEnvelope,
  placement: RealmCastleProjectionPlacement,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  scratch = new THREE.Vector3()
): RealmCastleScreenBounds | undefined {
  if (
    !validLocalBounds(envelope.localBounds)
    || !Number.isFinite(viewportWidth)
    || viewportWidth <= 0
    || !Number.isFinite(viewportHeight)
    || viewportHeight <= 0
  ) return undefined;
  const samples = trustedProjectionSamples(envelope);
  const projected = projectSamplesToScreenBounds(
    samples,
    placement,
    camera,
    viewportWidth,
    viewportHeight,
    scratch
  );
  if (projected || samples !== envelope.samples) return projected;
  return projectSamplesToScreenBounds(
    axisAlignedBoundsSamples(envelope.localBounds),
    placement,
    camera,
    viewportWidth,
    viewportHeight,
    scratch
  );
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
