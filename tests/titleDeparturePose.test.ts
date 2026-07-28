import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  applyTitleDeparturePose,
  captureTitleDeparturePose
} from '../src/components/title/titleDeparturePose';

function projectedGateway(
  camera: THREE.PerspectiveCamera,
  gateway: THREE.Object3D,
  sceneRoot: THREE.Object3D,
  width = 1,
  height = 1
) {
  sceneRoot.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const projected = gateway.getWorldPosition(new THREE.Vector3()).project(camera);
  return Object.freeze({
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    z: projected.z
  });
}

describe('title departure pose', () => {
  it('restores the exact rendered gateway pose throughout departure', () => {
    const pointerTarget = { x: 0.42, y: -0.18 };
    const pointerCurrent = { ...pointerTarget };
    const galaxyGroup = new THREE.Group();
    galaxyGroup.position.set(-0.8, 1.7, -18);
    const galaxyParallaxGroup = new THREE.Group();
    galaxyParallaxGroup.rotation.set(0.07, -0.11, 0);
    const galaxyGrowthGroup = new THREE.Group();
    galaxyGrowthGroup.scale.setScalar(1.16);
    const gateway = new THREE.Object3D();
    gateway.position.z = 0.24;
    galaxyGrowthGroup.add(gateway);
    galaxyParallaxGroup.add(galaxyGrowthGroup);
    galaxyGroup.add(galaxyParallaxGroup);

    const camera = new THREE.PerspectiveCamera(39, 16 / 9, 0.1, 100);
    camera.position.set(1.2, 0.38, 10.8);
    camera.lookAt(0.2, -0.3, -1.4);
    const before = projectedGateway(camera, gateway, galaxyGroup);
    const pose = captureTitleDeparturePose({
      pointerCurrent,
      galaxyGroup,
      galaxyGrowthGroup,
      galaxyParallaxGroup,
      camera
    });

    pointerTarget.x = 0;
    pointerTarget.y = 0;
    pointerCurrent.x = 0;
    pointerCurrent.y = 0;
    galaxyGroup.position.set(2.4, -1.1, galaxyGroup.position.z);
    galaxyGrowthGroup.scale.setScalar(2.1);
    galaxyParallaxGroup.rotation.set(-0.3, 0.4, 0);
    camera.position.set(-4, 3, -6);
    camera.lookAt(0, 0, -18);

    applyTitleDeparturePose(pose, {
      pointerTarget,
      pointerCurrent,
      galaxyGroup,
      galaxyGrowthGroup,
      galaxyParallaxGroup,
      camera
    });
    const after = projectedGateway(camera, gateway, galaxyGroup);

    expect(Object.isFrozen(pose)).toBe(true);
    expect(pointerTarget).toEqual({ x: 0.42, y: -0.18 });
    expect(pointerCurrent).toEqual(pointerTarget);
    expect(after.x).toBeCloseTo(before.x, 12);
    expect(after.y).toBeCloseTo(before.y, 12);
    expect(after.z).toBeCloseTo(before.z, 12);
  });

  it('restores only the captured departure pose without chasing a client pixel', () => {
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0.24, y: -0.09 };
    const sceneRoot = new THREE.Group();
    const galaxyGroup = new THREE.Group();
    galaxyGroup.position.set(-0.4, 1.3, -18);
    const galaxyParallaxGroup = new THREE.Group();
    const galaxyGrowthGroup = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(39, 16 / 9, 0.1, 100);
    camera.position.set(0.8, 0.3, 10.8);
    sceneRoot.add(galaxyGroup);
    galaxyGroup.add(galaxyParallaxGroup);
    galaxyParallaxGroup.add(galaxyGrowthGroup);

    const pose = captureTitleDeparturePose({
      pointerCurrent,
      galaxyGroup,
      galaxyGrowthGroup,
      galaxyParallaxGroup,
      camera
    });

    sceneRoot.position.set(9, -4, 2);
    galaxyGroup.position.set(3, 4, 5);
    applyTitleDeparturePose(pose, {
      pointerTarget,
      pointerCurrent,
      galaxyGroup,
      galaxyGrowthGroup,
      galaxyParallaxGroup,
      camera
    });

    expect(sceneRoot.position.toArray()).toEqual([9, -4, 2]);
    expect(galaxyGroup.position.toArray()).toEqual([
      pose.galaxyX,
      pose.galaxyY,
      pose.galaxyZ
    ]);
    expect(pointerTarget).toEqual({
      x: pose.pointerX,
      y: pose.pointerY
    });

    applyTitleDeparturePose(pose, {
      pointerTarget,
      pointerCurrent,
      galaxyGroup,
      galaxyGrowthGroup,
      galaxyParallaxGroup,
      camera
    });
    expect(sceneRoot.position.toArray()).toEqual([9, -4, 2]);
    expect(galaxyGroup.position.toArray()).toEqual([
      pose.galaxyX,
      pose.galaxyY,
      pose.galaxyZ
    ]);
  });

  it('rejects a non-finite pose before it can move the rendered gateway', () => {
    const galaxyGroup = new THREE.Group();
    const galaxyParallaxGroup = new THREE.Group();
    const galaxyGrowthGroup = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    camera.position.x = Number.NaN;

    expect(() => captureTitleDeparturePose({
      pointerCurrent: { x: 0, y: 0 },
      galaxyGroup,
      galaxyGrowthGroup,
      galaxyParallaxGroup,
      camera
    })).toThrow('TITLE_DEPARTURE_POSE_INVALID');
  });
});
