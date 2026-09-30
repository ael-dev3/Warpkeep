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
    // Broad turf/earth groups, informed by Tervain's grounded landscapes, keep
    // the civic approach quiet without adding textures or changing geometry.
    // World-space sampling also keeps adjoining quads and quality tiers coherent.
    const earth = new THREE.Color(P.ground);
    const forest = new THREE.Color(P.forestNear);
    const terraceTop = new THREE.Color();
    const palette = [new THREE.Color(P.masonry).multiplyScalar(0.82), new THREE.Color(P.masonry).multiplyScalar(0.62)];
    plan.surfacePlan.quads.forEach((quad, index) => {
      for (let v = 0; v < 4; v++) {
        const offset = (index * 4 + v) * 3;
        let c = palette[quad.material === 0 ? 0 : 1];
        if (quad.direction === 2) {
          const x = data.positions[offset] * P.budgets[quality].grid;
          const z = data.positions[offset + 2] * P.budgets[quality].grid;
          const moisture = .5 + Math.sin(x * .09 + z * .04) * .23 + Math.cos(z * .12 - x * .035) * .16;
          const approach = Math.max(0, 1 - Math.abs(x) / 22) * Math.max(0, Math.min(1, (z - 20) / 28));
          c = terraceTop.copy(earth).lerp(forest, .12 + moisture * .22 - approach * .06);
        }
        colors.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)], offset);
      }
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3, true));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.scale(P.budgets[quality].grid, 1, P.budgets[quality].grid);
    return { geometry, quads: data.mergedQuadCount };
  } catch (error) { geometry.dispose(); throw error; }
}
