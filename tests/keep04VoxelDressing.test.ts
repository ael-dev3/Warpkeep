import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { planKeep04Dressing, createKeep04Dressing } from '../src/components/keep04/keep04VoxelDressing';
afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

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

it('never runs full voxel planning on cold import or scene creation and retains genuine mesh emission', async () => {
  vi.resetModules();
  const mesher = await import('../src/components/realm/voxelSurfaceMesh');
  const fullPlanner = vi.spyOn(mesher, 'planVoxelSurface').mockImplementation(() => { throw new Error('Full voxel planning entered runtime'); });
  const emit = vi.spyOn(mesher, 'createVoxelSurfaceMeshData');
  const runtime = await import('../src/components/keep04/keep04VoxelDressing');
  for (const quality of ['high', 'balanced', 'reduced'] as const) {
    expect(() => runtime.createKeep04Dressing(quality).geometry.dispose()).not.toThrow();
    expect(emit).toHaveBeenLastCalledWith(runtime.planKeep04Dressing(quality).surfacePlan);
  }
  expect(fullPlanner).not.toHaveBeenCalled(); expect(emit).toHaveBeenCalledTimes(3);
});

it.each(['high', 'balanced', 'reduced'] as const)('shares deeply frozen %s plan data but owns every mutable geometry buffer', quality => {
  const plan = planKeep04Dressing(quality);
  expect(planKeep04Dressing(quality).surfacePlan).toBe(plan.surfacePlan);
  expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan.surfacePlan)).toBe(true);
  expect(Object.isFrozen(plan.surfacePlan.quads)).toBe(true);
  for (const quad of plan.surfacePlan.quads) expect(Object.isFrozen(quad)).toBe(true);
  const first = createKeep04Dressing(quality); const second = createKeep04Dressing(quality);
  try {
    for (const name of ['position', 'normal', 'color']) {
      const a = first.geometry.getAttribute(name); const b = second.geometry.getAttribute(name);
      expect(a.array).not.toBe(b.array); expect(a.array.buffer).not.toBe(b.array.buffer);
      const retained = b.array[0]; a.array[0] = 0; expect(b.array[0]).toBe(retained);
    }
    expect(first.geometry.index!.array.buffer).not.toBe(second.geometry.index!.array.buffer);
    const disposed = vi.fn(); second.geometry.addEventListener('dispose', disposed);
    first.geometry.dispose(); expect(disposed).not.toHaveBeenCalled();
  } finally { second.geometry.dispose(); }
});

// Captured from the unchanged full planner/palette/grid-scale pipeline at 4bbc0f9.
it.each(['high', 'balanced', 'reduced'] as const)('preserves exact baseline %s geometry bytes', quality => {
  const { geometry } = createKeep04Dressing(quality);
  const hash = (array: ArrayBufferView) => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
  try {
    expect(hash(geometry.getAttribute('position').array)).toBe('7f1006cbda6e65f2da6965b3608f0cbdd502fc19723d90b19ca5cf231813c1fa');
    expect(hash(geometry.getAttribute('normal').array)).toBe('54c9cd5a6e6df4e301eff8c8c15260fb238cea678f9b54fbd8b77ab8894f32d9');
    expect(hash(geometry.getAttribute('color').array)).toBe('f4771d4bf6dd802a419b1ebf30bc0c880bf3ef3fffc25f3e587890c9c3acb5fc');
    expect(hash(geometry.index!.array)).toBe('d5a2015fb9c44d21652756acdc47bfde6b0a71e275bf5cece9c72f077fd0fc66');
  } finally { geometry.dispose(); }
});

it.each(['cells', 'faces', 'quads'] as const)('rejects a generated plan exceeding the active %s reservation before allocation', async field => {
  const { KEEP04_VISUAL_PROFILE: profile } = await import('../src/components/keep04/keep04VisualProfile');
  const mesher = await import('../src/components/realm/voxelSurfaceMesh');
  const emit = vi.spyOn(mesher, 'createVoxelSurfaceMeshData');
  const runtime = await import('../src/components/keep04/keep04VoxelDressing');
  const previous = profile.budgets.high[field]; profile.budgets.high[field] = 1;
  try { expect(() => runtime.createKeep04Dressing('high')).toThrow(RangeError); expect(emit).not.toHaveBeenCalled(); }
  finally { profile.budgets.high[field] = previous; }
});

it('retains the actual scene voxel fallback when a generated plan cannot fit its reservation', async () => {
  const { KEEP04_VISUAL_PROFILE: profile } = await import('../src/components/keep04/keep04VisualProfile');
  const { createKeep04Scene } = await import('../src/components/keep04/createKeep04Scene');
  const previous = profile.budgets.high.cells; profile.budgets.high.cells = 1;
  try {
    const scene = createKeep04Scene({ quality: 'high', reducedMotion: true,
      assets: { staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() } });
    try {
      expect(scene.telemetry()).toMatchObject({ fallback: 'voxel', voxelQuads: 0 });
      expect(scene.scene.getObjectByName('simple-perimeter-fallback')).toBeDefined();
      expect(scene.scene.getObjectByName('voxel-terracing')).toBeUndefined();
    } finally { scene.dispose(); }
  } finally { profile.budgets.high.cells = previous; }
});

it.each(['high', 'balanced', 'reduced'] as const)('exactly matches the full offline %s planner and all emitted buffers', async quality => {
  const { planKeep04DressingSource } = await import('../src/components/keep04/planKeep04DressingSource');
  const { createVoxelSurfaceMeshData } = await import('../src/components/realm/voxelSurfaceMesh');
  const { KEEP04_DRESSING_PLANS } = await import('../src/components/keep04/keep04DressingPlans.generated');
  expect(Object.isFrozen(KEEP04_DRESSING_PLANS)).toBe(true);
  const generated = planKeep04Dressing(quality).surfacePlan;
  const offline = planKeep04DressingSource(quality);
  expect(generated).toStrictEqual(offline); // Includes every quad/order/material and all metadata.
  expect(generated).toMatchObject({ occupiedVoxelCount: quality === 'high' ? 4352 : 1088,
    exposedFaceCount: quality === 'high' ? 4000 : 1448, contextVoxelCount: 0,
    mergedQuadCount: 40, triangleCount: 80, uploadBytes: 3840,
    signature: quality === 'high' ? 'voxel-surface-v1:db3eb7f79af670a3' : 'voxel-surface-v1:ee0a4d811f16597d' });
  expect(createVoxelSurfaceMeshData(generated)).toStrictEqual(createVoxelSurfaceMeshData(offline));
});
