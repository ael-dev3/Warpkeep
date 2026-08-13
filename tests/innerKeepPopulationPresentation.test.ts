import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInnerKeepPopulationPresentation } from '../src/components/inner-keep/createInnerKeepPopulationPresentation';
import { createInnerKeepAmbientSimulationPlan } from '../src/components/inner-keep/innerKeepAmbientTimeline';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

afterEach(() => vi.restoreAllMocks());

function emptyRuntimeBundle(): InnerKeepRuntimeAssetBundle {
  return Object.freeze({
    staticPrefabs: new Map(),
    populationPrefabs: new Map(),
    failures: Object.freeze([]),
    dispose: vi.fn(),
  });
}

describe('Inner Keep population terrain contact', () => {
  it('grounds every exterior pose on the shared deterministic terrain sampler', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 0x5e77_1e,
      quality: 'reduced',
      reducedMotion: true,
    });
    const terrainHeightAt = (x: number, z: number) => 0.4 + x * 0.01 - z * 0.005;
    const presentation = createInnerKeepPopulationPresentation({
      bundle: emptyRuntimeBundle(),
      plan,
      terrainHeightAt,
    });

    for (const elapsedSeconds of [0, 12.5, 83]) {
      presentation.update(elapsedSeconds);
      const frame = presentation.getFrame();
      for (const pose of frame.actors) {
        const actor = presentation.group.getObjectByName(
          `inner-keep-ambient-actor:${pose.actorId}`,
        );
        expect(actor, pose.actorId).toBeDefined();
        expect(actor!.position.y).toBeCloseTo(
          terrainHeightAt(pose.position.x, pose.position.z) + 0.13,
          8,
        );
      }
    }

    presentation.dispose();
  });

  it('keeps the legacy flat-ground default for isolated consumers', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const presentation = createInnerKeepPopulationPresentation({
      bundle: emptyRuntimeBundle(),
      plan: createInnerKeepAmbientSimulationPlan({
        seed: 7,
        quality: 'reduced',
        reducedMotion: true,
      }),
    });
    presentation.group.children.forEach((actor) => {
      expect(actor.position.y).toBeCloseTo(0.13, 8);
    });
    presentation.dispose();
  });

  it('disposes a shared authored skeleton once during idempotent retirement', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 91,
      quality: 'balanced',
      reducedMotion: true,
    });
    const actorId = plan.routines[0]!.actor.actorId;
    const model = new THREE.Group();
    const bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    model.add(bone);
    for (let index = 0; index < 2; index += 1) {
      const mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.bind(skeleton);
      model.add(mesh);
    }
    const bundle: InnerKeepRuntimeAssetBundle = Object.freeze({
      staticPrefabs: new Map(),
      populationPrefabs: new Map([[actorId, Object.freeze({
        id: actorId,
        root: model,
        clips: Object.freeze([]),
        boundsMeters: Object.freeze([1, 1, 1] as const),
        triangles: 24,
        drawCalls: 2,
        animated: false,
        mounted: false,
        clone: () => model,
      })]]),
      failures: Object.freeze([]),
      dispose: vi.fn(),
    });
    const presentation = createInnerKeepPopulationPresentation({ bundle, plan });
    skeleton.computeBoneTexture();
    const disposeSkeleton = vi.spyOn(skeleton, 'dispose');

    presentation.dispose();
    presentation.dispose();

    expect(disposeSkeleton).toHaveBeenCalledOnce();
    expect(skeleton.boneTexture).toBeNull();
  });

  it('finishes retiring owned resources when skeleton disposal throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 117,
      quality: 'balanced',
      reducedMotion: true,
    });
    const actorId = plan.routines[0]!.actor.actorId;
    const model = new THREE.Group();
    const bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    const mesh = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    mesh.bind(skeleton);
    model.add(bone, mesh);
    const bundle: InnerKeepRuntimeAssetBundle = Object.freeze({
      staticPrefabs: new Map(),
      populationPrefabs: new Map([[actorId, Object.freeze({
        id: actorId,
        root: model,
        clips: Object.freeze([]),
        boundsMeters: Object.freeze([1, 1, 1] as const),
        triangles: 12,
        drawCalls: 1,
        animated: false,
        mounted: false,
        clone: () => model,
      })]]),
      failures: Object.freeze([]),
      dispose: vi.fn(),
    });
    const presentation = createInnerKeepPopulationPresentation({ bundle, plan });
    const fallbackActorId = plan.routines.find(({ actor }) => actor.actorId !== actorId)!
      .actor.actorId;
    const fallbackModel = presentation.group.getObjectByName(
      `inner-keep-fallback-actor-model:${fallbackActorId}`,
    )!;
    let fallbackMesh: THREE.Mesh | null = null;
    fallbackModel.traverse((object) => {
      if (!fallbackMesh && object instanceof THREE.Mesh) fallbackMesh = object;
    });
    const geometryDispose = vi.spyOn(fallbackMesh!.geometry, 'dispose');
    const fallbackMaterial = Array.isArray(fallbackMesh!.material)
      ? fallbackMesh!.material[0]!
      : fallbackMesh!.material;
    const materialDispose = vi.spyOn(fallbackMaterial, 'dispose');
    const parent = new THREE.Group();
    parent.add(presentation.group);
    skeleton.computeBoneTexture();
    const skeletonDispose = vi.spyOn(skeleton, 'dispose').mockImplementation(() => {
      skeleton.boneTexture?.dispose();
      skeleton.boneTexture = null;
      throw new Error('synthetic population skeleton disposal failure');
    });

    expect(() => presentation.dispose()).not.toThrow();
    presentation.dispose();

    expect(skeletonDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(presentation.group.parent).toBeNull();
    expect(parent.children).toHaveLength(0);
    expect(presentation.isAnimationActive()).toBe(false);
  });
});
