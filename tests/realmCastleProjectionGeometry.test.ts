import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { HegemonyKeepPrefabPrimitive } from '../src/components/realm/hegemonyKeepPrefabRepository';
import {
  deriveCastleRoofProjectionSamples,
  MAX_CASTLE_ROOF_PROJECTION_SAMPLES,
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

const IRREGULAR_KEEP_POINTS = Object.freeze([
  [-0.74, 0, -0.52], [0.74, 0, -0.52], [-0.74, 0, 0.52], [0.74, 0, 0.52],
  [-0.58, 0.62, -0.38], [0.58, 0.62, -0.38], [-0.58, 0.62, 0.38], [0.58, 0.62, 0.38],
  [-0.31, 0.92, -0.16], [-0.05, 1.06, 0.02], [0.28, 0.98, 0.18],
  [-0.18, 0.84, 0.31], [0.42, 0.76, -0.12]
] as const);

describe('castle roof projection geometry', () => {
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
