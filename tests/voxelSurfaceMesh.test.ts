import { describe, expect, it } from 'vitest';

import {
  createVoxelSurfaceMeshData,
  planVoxelSurface,
  type VoxelCell
} from '../src/components/realm/voxelSurfaceMesh';

const voxel = (x: number, y: number, z: number, material = 0): VoxelCell => ({
  x, y, z, material
});

function plan(
  voxels: readonly VoxelCell[],
  occluders: readonly VoxelCell[] = [],
  maximumVoxels = 32,
  maximumFaces = 64
) {
  return planVoxelSurface({ voxels, occluders, maximumVoxels, maximumFaces });
}

describe('bounded sparse voxel surface meshing', () => {
  it('emits the exact indexed geometry and byte accounting for one voxel', () => {
    const surface = plan([voxel(0, 0, 0)], [], 8, 12);
    const mesh = createVoxelSurfaceMeshData(surface);

    expect(surface.occupiedVoxelCount).toBe(1);
    expect(mesh.occupiedVoxelCount).toBe(1);
    expect(mesh.exposedFaceCount).toBe(6);
    expect(mesh.mergedQuadCount).toBe(6);
    expect(mesh.triangleCount).toBe(12);
    expect(mesh.uploadBytes).toBe(576);
    expect(mesh.uploadBytes).toBe(
      mesh.positions.byteLength
      + mesh.normals.byteLength
      + mesh.colors.byteLength
      + mesh.indices.byteLength
    );
    expect([...mesh.indices].every((index) => index < mesh.positions.length / 3)).toBe(true);
    expect(new Set(mesh.normals)).toEqual(new Set([-127, 0, 127]));
  });

  it('culls a shared face and greedily merges equal-material coplanar faces', () => {
    const mesh = createVoxelSurfaceMeshData(plan([
      voxel(0, 0, 0),
      voxel(1, 0, 0)
    ]));

    expect(mesh.exposedFaceCount).toBe(10);
    expect(mesh.mergedQuadCount).toBe(6);
    expect(mesh.triangleCount).toBe(12);
  });

  it('does not merge coplanar faces across a material boundary', () => {
    const mesh = createVoxelSurfaceMeshData(plan([
      voxel(0, 0, 0, 0),
      voxel(1, 0, 0, 1)
    ]));

    expect(mesh.exposedFaceCount).toBe(10);
    expect(mesh.mergedQuadCount).toBe(10);
  });

  it('is deterministic across input order and retains no caller arrays', () => {
    const input = [voxel(7, -2, 4, 2), voxel(6, -2, 4, 2), voxel(6, -1, 4, 3)];
    const first = plan(input);
    const second = plan([...input].reverse());
    input[0] = voxel(99, 99, 99, 4);

    expect(first).toEqual(second);
    expect(createVoxelSurfaceMeshData(first)).toEqual(createVoxelSurfaceMeshData(second));
    expect(first.signature).toBe(second.signature);
  });

  it.each([
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
  ])('uses an occluder in neighbour direction %i,%i,%i without emitting it', (x, y, z) => {
    const mesh = createVoxelSurfaceMeshData(plan(
      [voxel(0, 0, 0)],
      [voxel(x, y, z)]
    ));

    expect(mesh.occupiedVoxelCount).toBe(1);
    expect(mesh.exposedFaceCount).toBe(5);
    expect(mesh.mergedQuadCount).toBe(5);
  });

  it('supports empty and context-only inputs without emitted geometry', () => {
    for (const surface of [plan([]), plan([], [voxel(-4, 3, -2)])]) {
      const mesh = createVoxelSurfaceMeshData(surface);
      expect(mesh.occupiedVoxelCount).toBe(0);
      expect(mesh.exposedFaceCount).toBe(0);
      expect(mesh.mergedQuadCount).toBe(0);
      expect(mesh.uploadBytes).toBe(0);
    }
  });

  it('allows matching emitter/context overlap and rejects conflicting overlap', () => {
    expect(plan([voxel(0, 0, 0, 3)], [voxel(0, 0, 0, 3)]).occupiedVoxelCount).toBe(1);
    expect(() => plan([voxel(0, 0, 0, 3)], [voxel(0, 0, 0, 4)]))
      .toThrow(/conflicting material/i);
  });

  it('accepts signed coordinates and rejects invalid coordinates and materials', () => {
    expect(plan([voxel(-8, -3, -5)]).occupiedVoxelCount).toBe(1);
    for (const invalid of [
      voxel(Number.NaN, 0, 0),
      voxel(0.5, 0, 0),
      voxel(Number.MAX_SAFE_INTEGER + 1, 0, 0),
      voxel(0, Number.POSITIVE_INFINITY, 0),
      voxel(0, 0, 0, -1),
      voxel(0, 0, 0, 256)
    ]) {
      expect(() => plan([invalid])).toThrow(/voxel/i);
    }
  });

  it('rejects duplicates inside either occupancy set', () => {
    expect(() => plan([voxel(1, 2, 3), voxel(1, 2, 3)]))
      .toThrow(/duplicate emitting voxel/i);
    expect(() => plan([], [voxel(1, 2, 3), voxel(1, 2, 3)]))
      .toThrow(/duplicate occluder voxel/i);
  });

  it('enforces total occupancy and exposed-face caps at their boundaries', () => {
    expect(plan(
      [voxel(0, 0, 0), voxel(1, 0, 0)],
      [voxel(2, 0, 0)],
      3,
      9
    ).exposedFaceCount).toBe(9);
    expect(() => plan(
      [voxel(0, 0, 0), voxel(1, 0, 0)],
      [voxel(2, 0, 0)],
      2,
      9
    )).toThrow(/maximumVoxels/i);
    expect(() => plan([voxel(0, 0, 0)], [], 1, 5)).toThrow(/maximumFaces/i);
  });
});
