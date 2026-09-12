// Offline authoritative recipe for the immutable decorative dressing. Runtime
// imports the generated plans, never this occupancy/planning implementation.
import { planVoxelSurface, type VoxelCell } from '../realm/voxelSurfaceMesh';
import { KEEP04_VISUAL_PROFILE as P, type Quality04 } from './keep04VisualProfile';

export function planKeep04DressingSource(quality: Quality04) {
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
  return surfacePlan;
}
