import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { HegemonyKeepPrefabPrimitive } from '../src/components/realm/hegemonyKeepPrefabRepository';
import {
  castleSilhouetteIntersectsViewport,
  createCastleBoundsProjectionEnvelope,
  deriveCastleProjectionEnvelope,
  deriveCastleRoofProjectionSamples,
  MAX_CASTLE_ROOF_PROJECTION_SAMPLES,
  MAX_CASTLE_SILHOUETTE_PROJECTION_SAMPLES,
  projectCastleSilhouetteScreenBounds,
  projectCastleRoofScreenTop
} from '../src/components/realm/realmCastleProjectionGeometry';
import { deriveRealmCameraPoseForViewport } from '../src/components/realm/realmCameraController';

const VIEWPORT = { width: 1_440, height: 900 } as const;
const REALM_BOUNDS = {
  minX: -9.53,
  maxX: 9.53,
  minY: -0.2,
  maxY: 0.2,
  minZ: -8.5,
  maxZ: 8.5
} as const;

function primitive(points: readonly (readonly [number, number, number])[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points.flatMap((point) => [...point]), 3)
  );
  return {
    geometry,
    materials: [],
    localMatrixElements: [...new THREE.Matrix4().elements],
    sourceMeshName: 'roof-fixture'
  } satisfies HegemonyKeepPrefabPrimitive;
}

function cameraAt(zoom: number) {
  const pose = deriveRealmCameraPoseForViewport(
    zoom,
    { x: 0, z: 0 },
    REALM_BOUNDS,
    { x: 0, y: 0.05, z: 0, height: 1.06, footprintDiameter: 1.48 },
    VIEWPORT
  );
  const camera = new THREE.PerspectiveCamera(
    pose.fov,
    VIEWPORT.width / VIEWPORT.height,
    pose.near,
    pose.far
  );
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function screenY(point: readonly [number, number, number], camera: THREE.Camera) {
  const projected = new THREE.Vector3(point[0], point[1] + 0.05, point[2]).project(camera);
  return (-projected.y * 0.5 + 0.5) * VIEWPORT.height;
}

function screenPoint(
  point: readonly [number, number, number],
  placement: Readonly<{ x: number; renderY: number; z: number }>,
  camera: THREE.Camera
) {
  const projected = new THREE.Vector3(
    point[0] + placement.x,
    point[1] + placement.renderY,
    point[2] + placement.z
  ).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * VIEWPORT.width,
    y: (-projected.y * 0.5 + 0.5) * VIEWPORT.height
  };
}

const IRREGULAR_KEEP_POINTS = Object.freeze([
  [-0.74, 0, -0.52], [0.74, 0, -0.52], [-0.74, 0, 0.52], [0.74, 0, 0.52],
  [-0.58, 0.62, -0.38], [0.58, 0.62, -0.38], [-0.58, 0.62, 0.38], [0.58, 0.62, 0.38],
  [-0.31, 0.92, -0.16], [-0.05, 1.06, 0.02], [0.28, 0.98, 0.18],
  [-0.18, 0.84, 0.31], [0.42, 0.76, -0.12]
] as const);

describe('castle roof projection geometry', () => {
  it('keeps an edge-panned silhouette visible after its roof center leaves the viewport', () => {
    const envelope = deriveCastleProjectionEnvelope([primitive(IRREGULAR_KEEP_POINTS)])!;
    const camera = cameraAt(1);
    const formerHorizontalVisibilityMargin = VIEWPORT.width * 0.025;
    let edgeCase:
      | Readonly<{
          bounds: NonNullable<ReturnType<typeof projectCastleSilhouetteScreenBounds>>;
          centerX: number;
        }>
      | undefined;

    for (let x = -20; x <= 20 && !edgeCase; x += 0.01) {
      const placement = { x, renderY: 0.05, z: 0 } as const;
      const centerX = screenPoint(
        [0, envelope.localBounds.maxY, 0],
        placement,
        camera
      ).x;
      const bounds = projectCastleSilhouetteScreenBounds(
        envelope,
        placement,
        camera,
        VIEWPORT.width,
        VIEWPORT.height
      );
      if (
        bounds
        && centerX < -formerHorizontalVisibilityMargin
        && bounds.right > 0
      ) edgeCase = { bounds, centerX };
    }

    expect(edgeCase).toBeDefined();
    // The retired center-only gate accepted NDC x down to -1.05, which is
    // -2.5% of the viewport in screen coordinates. This exact case proves the
    // center would have failed that gate while the rendered hull remains live.
    expect(edgeCase!.centerX).toBeLessThan(-formerHorizontalVisibilityMargin);
    expect(edgeCase!.bounds.right).toBeGreaterThan(0);
    expect(castleSilhouetteIntersectsViewport(
      edgeCase!.bounds,
      VIEWPORT.width,
      VIEWPORT.height
    )).toBe(true);
    expect(castleSilhouetteIntersectsViewport(
      { ...edgeCase!.bounds, right: 0 },
      VIEWPORT.width,
      VIEWPORT.height
    )).toBe(false);
  });

  it('projects an exact containing silhouette across camera pitches and edge placements', () => {
    const envelope = deriveCastleProjectionEnvelope([primitive(IRREGULAR_KEEP_POINTS)]);
    expect(envelope).toBeDefined();
    expect(envelope?.mode).toBe('convex-hull');
    expect(envelope!.samples.length).toBeLessThanOrEqual(
      MAX_CASTLE_SILHOUETTE_PROJECTION_SAMPLES
    );
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope!.localBounds)).toBe(true);
    expect(Object.isFrozen(envelope!.samples)).toBe(true);
    expect(envelope!.samples.every(Object.isFrozen)).toBe(true);

    const placements = [
      { x: 0, renderY: 0.05, z: 0 },
      { x: -8.1, renderY: 0.12, z: 6.4 },
      { x: 8.2, renderY: -0.04, z: -6.3 }
    ] as const;
    for (const zoom of [0, 0.5, 1]) {
      const camera = cameraAt(zoom);
      for (const placement of placements) {
        const bounds = projectCastleSilhouetteScreenBounds(
          envelope!,
          placement,
          camera,
          VIEWPORT.width,
          VIEWPORT.height
        );
        expect(bounds).toBeDefined();
        const exhaustive = IRREGULAR_KEEP_POINTS.map((point) => (
          screenPoint(point, placement, camera)
        ));
        // BufferGeometry stores Float32 positions; compare within a sub-pixel
        // tolerance against the source literals used to build the fixture.
        expect(bounds!.left).toBeCloseTo(Math.min(...exhaustive.map((point) => point.x)), 3);
        expect(bounds!.top).toBeCloseTo(Math.min(...exhaustive.map((point) => point.y)), 3);
        expect(bounds!.right).toBeCloseTo(Math.max(...exhaustive.map((point) => point.x)), 3);
        expect(bounds!.bottom).toBeCloseTo(Math.max(...exhaustive.map((point) => point.y)), 3);
        exhaustive.forEach((point) => {
          expect(point.x).toBeGreaterThanOrEqual(bounds!.left - 0.001);
          expect(point.x).toBeLessThanOrEqual(bounds!.right + 0.001);
          expect(point.y).toBeGreaterThanOrEqual(bounds!.top - 0.001);
          expect(point.y).toBeLessThanOrEqual(bounds!.bottom + 0.001);
        });
      }
    }
  });

  it('falls back to a containing eight-corner AABB instead of truncating a hull', () => {
    const points: Array<readonly [number, number, number]> = [];
    for (let index = 0; index < 80; index += 1) {
      const y = 1 - (index / 79) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      points.push([
        Math.cos(angle) * radius * 0.74,
        (y + 1) * 0.81,
        Math.sin(angle) * radius * 0.57
      ]);
    }
    const envelope = deriveCastleProjectionEnvelope([primitive(points)], {
      maximumHullVertices: 16
    });
    expect(envelope).toMatchObject({ mode: 'axis-aligned-bounds' });
    expect(envelope?.samples).toHaveLength(8);

    const placement = { x: 7.8, renderY: 0.06, z: -6.1 } as const;
    const camera = cameraAt(0.5);
    const bounds = projectCastleSilhouetteScreenBounds(
      envelope!,
      placement,
      camera,
      VIEWPORT.width,
      VIEWPORT.height
    );
    expect(bounds).toBeDefined();
    points.map((point) => screenPoint(point, placement, camera)).forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(bounds!.left - 0.001);
      expect(point.x).toBeLessThanOrEqual(bounds!.right + 0.001);
      expect(point.y).toBeGreaterThanOrEqual(bounds!.top - 0.001);
      expect(point.y).toBeLessThanOrEqual(bounds!.bottom + 0.001);
    });
  });

  it('fails closed to local bounds for an untrusted finite structural envelope', () => {
    const localBounds = {
      minX: -0.74,
      minY: 0,
      minZ: -0.57,
      maxX: 0.74,
      maxY: 1.62,
      maxZ: 0.57
    } as const;
    const forgedEnvelope = {
      mode: 'convex-hull' as const,
      localBounds,
      samples: [
        { x: -0.1, y: 0.7, z: -0.1 },
        { x: 0.1, y: 0.7, z: -0.1 },
        { x: 0, y: 0.9, z: 0.1 },
        { x: 0, y: 0.6, z: 0.1 }
      ]
    };
    const trustedBoundsEnvelope = createCastleBoundsProjectionEnvelope(localBounds)!;
    const placement = { x: 1.7, renderY: 0.05, z: -0.8 } as const;
    const camera = cameraAt(0.5);

    expect(projectCastleSilhouetteScreenBounds(
      forgedEnvelope,
      placement,
      camera,
      VIEWPORT.width,
      VIEWPORT.height
    )).toEqual(projectCastleSilhouetteScreenBounds(
      trustedBoundsEnvelope,
      placement,
      camera,
      VIEWPORT.width,
      VIEWPORT.height
    ));
  });

  it('uses the containing AABB when there are too few vertices for a hull', () => {
    const points = [
      [0, 0, 0],
      [1, 1, 0],
      [0, 0, 1]
    ] as const;
    const envelope = deriveCastleProjectionEnvelope([primitive(points)]);
    expect(envelope).toMatchObject({
      mode: 'axis-aligned-bounds',
      localBounds: {
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 1,
        maxY: 1,
        maxZ: 1
      }
    });
    expect(envelope?.samples).toHaveLength(8);
  });

  it('keeps the public silhouette projection budget fixed', () => {
    expect(MAX_CASTLE_SILHOUETTE_PROJECTION_SAMPLES).toBe(512);
  });

  it('tracks the actual irregular roof at overview and close zoom', () => {
    const samples = deriveCastleRoofProjectionSamples(
      [primitive(IRREGULAR_KEEP_POINTS)],
      {
        azimuthDegrees: 43,
        minimumPitchDegrees: 24,
        maximumPitchDegrees: 51
      }
    );

    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThanOrEqual(MAX_CASTLE_ROOF_PROJECTION_SAMPLES);
    for (const zoom of [0, 0.5, 1]) {
      const camera = cameraAt(zoom);
      const expected = Math.min(...IRREGULAR_KEEP_POINTS.map((point) => screenY(point, camera)));
      const projected = projectCastleRoofScreenTop(
        samples,
        { x: 0, renderY: 0.05, z: 0 },
        camera,
        VIEWPORT.height
      );
      expect(projected).toBeDefined();
      expect(Math.abs(projected! - expected)).toBeLessThan(0.01);
    }
  });

  it('keeps preprocessing and every frame projection inside a fixed sample cap', () => {
    const denseRoof: Array<readonly [number, number, number]> = [];
    for (let x = 0; x < 40; x += 1) {
      for (let z = 0; z < 40; z += 1) {
        denseRoof.push([
          x / 39 * 1.48 - 0.74,
          0.55 + ((x * 17 + z * 31) % 47) / 100,
          z / 39 * 1.04 - 0.52
        ]);
      }
    }

    const samples = deriveCastleRoofProjectionSamples([primitive(denseRoof)], {
      azimuthDegrees: 43,
      minimumPitchDegrees: 24,
      maximumPitchDegrees: 51
    });

    expect(denseRoof).toHaveLength(1_600);
    expect(samples.length).toBeLessThanOrEqual(MAX_CASTLE_ROOF_PROJECTION_SAMPLES);
    expect(Object.isFrozen(samples)).toBe(true);
    expect(samples.every(Object.isFrozen)).toBe(true);
  });
});
