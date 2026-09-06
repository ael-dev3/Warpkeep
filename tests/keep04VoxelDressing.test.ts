import { expect, it } from 'vitest';
import { planKeep04Dressing, createKeep04Dressing } from '../src/components/keep04/keep04VoxelDressing';

it.each([['high', 8192, 32768, 2048], ['balanced', 4096, 16384, 1024], ['reduced', 2048, 8192, 512]] as const)('bounds deterministic %s dressing before upload', (quality, cells, faces, quads) => {
  const plan = planKeep04Dressing(quality);
  expect(plan.surfacePlan.occupiedVoxelCount).toBeLessThanOrEqual(cells);
  expect(plan.surfacePlan.exposedFaceCount).toBeLessThanOrEqual(faces);
  expect(plan.surfacePlan.mergedQuadCount).toBeLessThanOrEqual(quads);
  expect(plan.surfacePlan.uploadBytes).toBeLessThanOrEqual(quads * 96);
  expect(plan.pickable).toBe(false); expect(plan.supportHeight).toBe(0);
  expect(planKeep04Dressing(quality)).toEqual(plan);
  const dressing = createKeep04Dressing(quality);
  expect(dressing.geometry.getAttribute('normal').normalized).toBe(true);
  expect(dressing.geometry.getAttribute('color').normalized).toBe(true);
  dressing.geometry.computeBoundingBox();
  expect(dressing.geometry.boundingBox!.max.y).toBeLessThanOrEqual(0);
  const color = dressing.geometry.getAttribute('color');
  expect(color.getX(0)).toBeGreaterThan(.35);
  expect(color.getX(0)).toBeGreaterThanOrEqual(color.getY(0));
  dressing.geometry.dispose();
});
