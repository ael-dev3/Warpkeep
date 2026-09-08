import * as THREE from 'three';
import { createVoxelSurfaceMeshData } from '../realm/voxelSurfaceMesh';
import { KEEP04_VISUAL_PROFILE as P, type Quality04 } from './keep04VisualProfile';
import { KEEP04_DRESSING_PLANS } from './keep04DressingPlans.generated';

export function planKeep04Dressing(quality: Quality04) {
  // Only immutable plans are shared. Full occupancy/sort/merge/signature work
  // happens offline; every scene still performs genuine mesh emission below.
  const budget = P.budgets[quality]; const surfacePlan = KEEP04_DRESSING_PLANS[quality];
  if (surfacePlan.occupiedVoxelCount > budget.cells || surfacePlan.exposedFaceCount > budget.faces
    || surfacePlan.mergedQuadCount > budget.quads || surfacePlan.uploadBytes > budget.quads * 96) throw new RangeError('Keep dressing exceeds upload reservation.');
  return Object.freeze({ surfacePlan, pickable: false as const, supportHeight: 0 as const });
}

export function createKeep04Dressing(quality: Quality04) {
  const plan = planKeep04Dressing(quality); // Reject oversize before typed-array allocation.
  const data = createVoxelSurfaceMeshData(plan.surfacePlan); const geometry = new THREE.BufferGeometry();
  try {
    const colors = data.colors.slice();
    // Ground-cover tops let the keep and civic path lead the scene; warm stone
    // remains on the retaining faces. Reuse the existing vertex-color upload.
    const terraceTop = new THREE.Color(P.ground).lerp(new THREE.Color(P.forestNear), 0.18);
    const palette = [new THREE.Color(P.masonry).multiplyScalar(0.82), new THREE.Color(P.masonry).multiplyScalar(0.62)];
    plan.surfacePlan.quads.forEach((quad, index) => {
      const c = quad.direction === 2 ? terraceTop : palette[quad.material === 0 ? 0 : 1];
      for (let v = 0; v < 4; v++) colors.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)], (index * 4 + v) * 3);
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3, true));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.scale(P.budgets[quality].grid, 1, P.budgets[quality].grid);
    return { geometry, quads: data.mergedQuadCount };
  } catch (error) { geometry.dispose(); throw error; }
}
