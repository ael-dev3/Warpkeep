import { expect, it } from 'vitest';
import * as THREE from 'three';
import { fitKeep04Camera, KEEP04_VISUAL_PROFILE } from '../src/components/keep04/keep04VisualProfile';
import { planKeep04Assets } from '../src/components/keep04/loadKeep04Assets';

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
