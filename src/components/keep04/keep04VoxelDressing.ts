import * as THREE from 'three';
import { createVoxelSurfaceMeshData, planVoxelSurface, type VoxelCell } from '../realm/voxelSurfaceMesh';
import { KEEP04_VISUAL_PROFILE as P, type Quality04 } from './keep04VisualProfile';

export function planKeep04Dressing(quality: Quality04) {
  const budget = P.budgets[quality]; const grid = budget.grid; const voxels: VoxelCell[] = [];
  // Three continuous stepped rings. Their inner faces never rise above legal y=0.
  outer: for (let z = -52 / grid; z < 44 / grid; z++) for (let x = -56 / grid; x < 56 / grid; x++) {
    const wx = x * grid; const wz = z * grid;
    if (wx >= -44 && wx < 44 && wz >= -40 && wz < 32) continue;
    const distance = Math.max(-44 - wx, wx + grid - 44, -40 - wz, wz + grid - 32);
    const top = -Math.max(1, Math.ceil(distance / 4));
    for (let y = -5; y <= top; y++) {
      if (voxels.length >= budget.cells) break outer;
      voxels.push({ x, y, z, material: y === top ? 0 : 1 });
    }
  }
  const surfacePlan = planVoxelSurface({ voxels, maximumVoxels: budget.cells, maximumFaces: budget.faces });
  if (surfacePlan.mergedQuadCount > budget.quads || surfacePlan.uploadBytes > budget.quads * 96) throw new RangeError('Keep dressing exceeds upload reservation.');
  return Object.freeze({ surfacePlan, pickable: false as const, supportHeight: 0 as const });
}

export function createKeep04Dressing(quality: Quality04) {
  const plan = planKeep04Dressing(quality); // Reject oversize before typed-array allocation.
  const data = createVoxelSurfaceMeshData(plan.surfacePlan); const geometry = new THREE.BufferGeometry();
  try {
    const colors = data.colors.slice();
    const palette = [new THREE.Color(P.masonry), new THREE.Color(P.masonry).multiplyScalar(0.8)];
    plan.surfacePlan.quads.forEach((quad, index) => {
      const c = palette[quad.material === 0 ? 0 : 1];
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
