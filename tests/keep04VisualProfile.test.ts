import { expect, it } from 'vitest';
import * as THREE from 'three';
import { fitKeep04Camera, fitKeep04SiteCamera, KEEP04_MOBILE_OVERVIEW_ASPECT, KEEP04_VISUAL_PROFILE } from '../src/components/keep04/keep04VisualProfile';
import { planKeep04Assets } from '../src/components/keep04/loadKeep04Assets';

it.each([.3, 342 / 147, 796 / 144, 2])('contains off-center site bounds with inspection padding at aspect %s', aspect => {
  const camera = new THREE.OrthographicCamera(); fitKeep04Camera(camera, aspect);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  for (const x of [-38, 38]) for (const z of [-34, 26]) for (const size of [new THREE.Vector3(10, 8, 12), new THREE.Vector3(37, 40, 32)]) {
    const bounds = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, size.y / 2, z), size);
    expect(fitKeep04SiteCamera(camera, aspect, bounds)).toBe(true);
    expect(camera.top).toBeGreaterThanOrEqual(12);
    expect(camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction)).toBeLessThan(1e-10);
    for (const px of [bounds.min.x, bounds.max.x]) for (const py of [bounds.min.y, bounds.max.y]) for (const pz of [bounds.min.z, bounds.max.z]) {
      const p = new THREE.Vector3(px, py, pz).project(camera);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.2 + 1e-8);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.2 + 1e-8);
    }
  }
});
it.each([342 / 304, 342 / 147, 796 / 144])('raises explicit inspection above a foreground neighbor without changing azimuth at aspect %s', aspect => {
  const camera = new THREE.OrthographicCamera(); fitKeep04Camera(camera, aspect);
  const bounds = new THREE.Box3(new THREE.Vector3(-5, 0, -6), new THREE.Vector3(5, 8, 6));
  const direction = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  // A nearby tall building blocks the same site sightline after a crop-only fit.
  const neighbor = new THREE.Box3().setFromCenterAndSize(direction.clone().multiplyScalar(-12).setY(6), new THREE.Vector3(8, 12, 8));
  const facade = new THREE.Vector3(0, 3, 0); const raycaster = new THREE.Raycaster();
  const intersectsNeighbor = () => {
    const screen = facade.clone().project(camera); raycaster.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera);
    return raycaster.ray.intersectBox(neighbor, new THREE.Vector3());
  };
  fitKeep04SiteCamera(camera, aspect, bounds);
  expect(intersectsNeighbor()).not.toBeNull();
  expect(fitKeep04SiteCamera(camera, aspect, bounds, true)).toBe(true);
  expect(intersectsNeighbor()).toBeNull();
  expect(camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().distanceTo(direction)).toBeLessThan(1e-10);
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(x, y, z).project(camera);
    expect(Math.abs(point.x)).toBeLessThanOrEqual(1 / 1.2 + 1e-8); expect(Math.abs(point.y)).toBeLessThanOrEqual(1 / 1.2 + 1e-8);
    expect(Math.abs(point.z)).toBeLessThan(1);
  }
});
it('uses a readable facade-biased overview on narrow scene canvases and preserves the diagonal desktop view', () => {
  const desktop = new THREE.OrthographicCamera(); fitKeep04Camera(desktop, KEEP04_MOBILE_OVERVIEW_ASPECT + .01);
  const mobile = new THREE.OrthographicCamera(); fitKeep04Camera(mobile, KEEP04_MOBILE_OVERVIEW_ASPECT - .01);
  expect(desktop.position.x).toBeGreaterThan(70);
  expect(mobile.position.x).toBeLessThan(desktop.position.x * .6);
  expect(desktop.getWorldDirection(new THREE.Vector3()).x).toBeLessThan(-.35);
  expect(Math.abs(mobile.getWorldDirection(new THREE.Vector3()).x)).toBeLessThan(.35);
});
it('uses a 24 metre minimum inspection span, permits oversized bounds, and safely rejects invalid bounds', () => {
  const camera = new THREE.OrthographicCamera(); fitKeep04Camera(camera, 1);
  expect(fitKeep04SiteCamera(camera, 1, new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1)))).toBe(true);
  expect(camera.top - camera.bottom).toBe(24);
  expect(fitKeep04SiteCamera(camera, 1, new THREE.Box3(new THREE.Vector3(-500, 0, -500), new THREE.Vector3(500, 100, 500)))).toBe(true);
  expect(camera.top).toBeGreaterThan(500);
  const matrix = camera.projectionMatrix.clone(); const position = camera.position.clone(); const quaternion = camera.quaternion.clone();
  for (const inspection of [false, true]) {
    expect(fitKeep04SiteCamera(camera, 1, new THREE.Box3(), inspection)).toBe(false);
    expect(fitKeep04SiteCamera(camera, 1, new THREE.Box3(new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(1, 1, 1)), inspection)).toBe(false);
    expect(fitKeep04SiteCamera(camera, 0, new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)), inspection)).toBe(false);
    expect(camera.projectionMatrix.equals(matrix)).toBe(true); expect(camera.position.equals(position)).toBe(true); expect(camera.quaternion.equals(quaternion)).toBe(true);
  }
});

it.each([390 / 500, 1440 / 760])('fits every legal deck corner at aspect %s', aspect => {
  const camera = new THREE.OrthographicCamera();
  fitKeep04Camera(camera, aspect);
  for (const x of [-44, 44]) for (const z of [-40, 32]) {
    const point = new THREE.Vector3(x, 0, z).project(camera);
    expect(Math.abs(point.x)).toBeLessThanOrEqual(1 / 1.1 + 1e-6);
    expect(Math.abs(point.y)).toBeLessThanOrEqual(1 / 1.1 + 1e-6);
  }
});
it.each([390 / 500, 1440 / 760])('also fits the intended terracing and forest frame at aspect %s', aspect => {
  const camera = new THREE.OrthographicCamera(); fitKeep04Camera(camera, aspect);
  for (const [x, y, z] of [[-56, -5, -64], [56, -5, -64], [-56, -5, 44], [56, -5, 44], [-56, 18, -64], [56, 18, -64]]) {
    const p = new THREE.Vector3(x, y, z).project(camera);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.1 + 1e-6); expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.1 + 1e-6);
  }
});
it.each(['high', 'balanced', 'reduced'] as const)('admits the full six-building catalog within %s transfer/geometry gates', quality => {
  const plan = planKeep04Assets(quality);
  expect(plan.staticAssetIds).toEqual(expect.arrayContaining(['city-mill', 'lumber-camp', 'city-stoneworks', 'city-goldworks', 'city-barracks', 'grand-covenant-cathedral']));
  expect(plan.bytes).toBeLessThanOrEqual(KEEP04_VISUAL_PROFILE.budgets[quality].transferBytes);
  expect(plan.triangles).toBeLessThanOrEqual(KEEP04_VISUAL_PROFILE.budgets[quality].triangles);
  expect(plan.populationActorIds).toEqual([]);
});
