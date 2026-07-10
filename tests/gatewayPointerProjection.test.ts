import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createGatewayPointerProjectionScratch,
  projectGatewayPointerToDisc,
  type GatewayPointerProjection
} from '../src/components/title/gatewayPointerProjection';

function createOutput(): GatewayPointerProjection {
  return { x: 0, y: 0, valid: false };
}

describe('Warpkeep gateway pointer projection', () => {
  it('projects an identity disc into normalized spin-local coordinates', () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    const spinGroup = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
    spinGroup.add(disc);
    const target = new THREE.Vector3(2, -3, 0).project(camera);
    const output = createOutput();
    const scratch = createGatewayPointerProjectionScratch();

    const returned = projectGatewayPointerToDisc(
      target.x,
      target.y,
      camera,
      disc,
      spinGroup,
      5,
      output,
      scratch
    );

    expect(returned).toBe(output);
    expect(output.valid).toBe(true);
    expect(output.x).toBeCloseTo(0.4, 8);
    expect(output.y).toBeCloseTo(-0.6, 8);
    disc.geometry.dispose();
  });

  it('round-trips through the transformed galaxy hierarchy and real disc plane', () => {
    const galaxy = new THREE.Group();
    galaxy.position.set(0.7, 1.35, -7);
    galaxy.rotation.y = 0.14;
    galaxy.scale.setScalar(0.82);

    const parallax = new THREE.Group();
    parallax.rotation.set(0.09, -0.11, 0);
    const growth = new THREE.Group();
    growth.scale.setScalar(1.17);
    const tilt = new THREE.Group();
    tilt.rotation.x = 0.71;
    const spinGroup = new THREE.Group();
    spinGroup.rotation.z = 0.43;
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
    disc.position.z = -0.075;

    spinGroup.add(disc);
    tilt.add(spinGroup);
    growth.add(tilt);
    parallax.add(growth);
    galaxy.add(parallax);
    galaxy.updateMatrixWorld(true);

    const expectedSpinLocal = new THREE.Vector3(1.4, -0.85, disc.position.z);
    const worldPoint = expectedSpinLocal.clone().applyMatrix4(spinGroup.matrixWorld);
    const camera = new THREE.PerspectiveCamera(39, 16 / 9, 0.1, 100);
    camera.position.set(1.8, 2.7, 10.8);
    camera.lookAt(galaxy.position.x, galaxy.position.y, galaxy.position.z);
    camera.updateMatrixWorld(true);
    const ndc = worldPoint.clone().project(camera);
    expect(Math.abs(ndc.x)).toBeLessThan(1);
    expect(Math.abs(ndc.y)).toBeLessThan(1);

    const output = createOutput();
    const scratch = createGatewayPointerProjectionScratch();
    projectGatewayPointerToDisc(
      ndc.x,
      ndc.y,
      camera,
      disc,
      spinGroup,
      5,
      output,
      scratch
    );

    expect(output.valid).toBe(true);
    expect(output.x).toBeCloseTo(expectedSpinLocal.x / 5, 7);
    expect(output.y).toBeCloseTo(expectedSpinLocal.y / 5, 7);
    disc.geometry.dispose();
  });

  it('invalidates non-finite NDC, degenerate transforms, and rays with no forward hit', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    const spinGroup = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
    spinGroup.add(disc);
    const scratch = createGatewayPointerProjectionScratch();
    const output: GatewayPointerProjection = { x: 12, y: -8, valid: true };

    projectGatewayPointerToDisc(
      Number.NaN,
      0,
      camera,
      disc,
      spinGroup,
      5,
      output,
      scratch
    );
    expect(output).toEqual({ x: 0, y: 0, valid: false });

    spinGroup.scale.z = 0;
    projectGatewayPointerToDisc(0, 0, camera, disc, spinGroup, 5, output, scratch);
    expect(output).toEqual({ x: 0, y: 0, valid: false });

    spinGroup.scale.setScalar(1);
    camera.lookAt(0, 0, 20);
    projectGatewayPointerToDisc(0, 0, camera, disc, spinGroup, 5, output, scratch);
    expect(output).toEqual({ x: 0, y: 0, valid: false });
    disc.geometry.dispose();
  });
});
