import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  applyTitleDeparturePose,
  captureTitleDeparturePose,
  pinTitleDepartureGatewayToViewport,
  titleDepartureClientPointToViewport
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

  it('pins the gateway to the activation pixel after a departure resize', () => {
    const initialWidth = 1_440;
    const initialHeight = 900;
    const resizedWidth = 1_024;
    const resizedHeight = 768;
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };
    const scene = new THREE.Scene();
    const galaxyGroup = new THREE.Group();
    galaxyGroup.position.set(0, 1.55, -18);
    const galaxyParallaxGroup = new THREE.Group();
    const galaxyGrowthGroup = new THREE.Group();
    const gateway = new THREE.Object3D();
    galaxyGrowthGroup.add(gateway);
    galaxyParallaxGroup.add(galaxyGrowthGroup);
    galaxyGroup.add(galaxyParallaxGroup);
    scene.add(galaxyGroup);
    const camera = new THREE.PerspectiveCamera(
      39,
      initialWidth / initialHeight,
      0.1,
      100
    );
    camera.position.set(0, 0.22, 10.8);
    camera.lookAt(0, -0.42, -1.4);
    const activation = projectedGateway(
      camera,
      gateway,
      scene,
      initialWidth,
      initialHeight
    );
    const pose = captureTitleDeparturePose({
      pointerCurrent,
      galaxyGroup,
      galaxyGrowthGroup,
      galaxyParallaxGroup,
      camera
    });

    camera.aspect = resizedWidth / resizedHeight;
    camera.updateProjectionMatrix();
    galaxyGroup.scale.setScalar(0.64);
    galaxyGroup.position.y = 2.8;
    applyTitleDeparturePose(pose, {
      pointerTarget,
      pointerCurrent,
      galaxyGroup,
      galaxyGrowthGroup,
      galaxyParallaxGroup,
      camera
    });
    pinTitleDepartureGatewayToViewport({
      gateway,
      movableRoot: galaxyGroup,
      camera,
      x: activation.x,
      y: activation.y,
      width: resizedWidth,
      height: resizedHeight
    });
    const afterResize = projectedGateway(
      camera,
      gateway,
      scene,
      resizedWidth,
      resizedHeight
    );

    expect(afterResize.x).toBeCloseTo(activation.x, 10);
    expect(afterResize.y).toBeCloseTo(activation.y, 10);
    expect(afterResize.z).toBeCloseTo(activation.z, 12);
    expect(galaxyGroup.scale.x).toBe(pose.galaxyScaleX);
  });

  it('inverts an offset and scaled title surface before pinning', () => {
    expect(titleDepartureClientPointToViewport(
      { x: 686.4, y: 326 },
      { left: 96, top: 80, width: 1_180.8, height: 738 },
      { width: 1_440, height: 900 }
    )).toEqual({ x: 720, y: 300 });
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
