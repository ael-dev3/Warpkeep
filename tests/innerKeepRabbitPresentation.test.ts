import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInnerKeepRabbitPresentation,
  type AcquireInnerKeepRabbitPrefab,
} from '../src/components/inner-keep/createInnerKeepRabbitPresentation';
import {
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';

function fakeRabbitAcquirer(options: Readonly<{
  animated?: boolean;
  failCloneAt?: number;
}> = {}) {
  const release = vi.fn();
  let cloneCount = 0;
  const clips = options.animated === false
    ? Object.freeze([])
    : Object.freeze([
        new THREE.AnimationClip('Idle', 1, []),
        new THREE.AnimationClip('Nibble', 1.2, []),
        new THREE.AnimationClip('Walk', 0.8, []),
      ]);
  const acquire = vi.fn<AcquireInnerKeepRabbitPrefab>(async ({ lod }) => Object.freeze({
    prefab: Object.freeze({
      lod,
      assetUrl: `/rabbit-${lod}.glb`,
      sourceRoot: new THREE.Group(),
      clips,
      boundsMeters: Object.freeze([0.2, 0.26, 0.34] as const),
      footprintDiameter: 0.34,
      visualHeight: 0.26,
      triangles: 350,
      animated: options.animated !== false,
      clone: () => {
        cloneCount += 1;
        if (cloneCount === options.failCloneAt) throw new Error('rabbit clone failed');
        const root = new THREE.Group();
        root.add(new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.26, 0.34),
          new THREE.MeshStandardMaterial(),
        ));
        return root;
      },
    }),
    release,
  }));
  return { acquire, release, cloneCount: () => cloneCount };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Inner Keep exact rabbit presentation', () => {
  it.each(['high', 'balanced'] as const)(
    'loads, grounds, animates, and releases the %s herd',
    async (quality) => {
      const { acquire, release } = fakeRabbitAcquirer();
      const requestRender = vi.fn();
      const presentation = createInnerKeepRabbitPresentation({
        quality,
        visualSeed: 91,
        reducedMotion: false,
        baseUrl: '/',
        acquirePrefab: acquire,
        requestRender,
        terrainHeightAt: (x, z) => 0.4 + x * 0.01 - z * 0.005,
        pointIsClear: () => true,
      });
      expect(presentation.getTelemetry().status).toBe('loading');
      await presentation.ready;
      const expectedCount = INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS[quality].wildlifeActors;
      expect(presentation.getTelemetry()).toMatchObject({
        status: 'ready',
        lod: 'balanced',
        rabbitCount: expectedCount,
        animatedRabbitCount: expectedCount,
        groundedRabbitCount: expectedCount,
        animationMixerCount: expectedCount,
        runtimeAssetFailureCount: 0,
        gameplayAuthority: 'none',
      });
      const first = presentation.group.getObjectByName('inner-keep-lowlands-rabbit:0')!;
      const before = first.position.clone();
      expect(presentation.update(4)).toBe(true);
      expect(first.position.equals(before)).toBe(false);
      presentation.group.traverse((object) => {
        expect(object.userData.presentationOnly).toBe(true);
        expect(object.userData.gameplayAuthorityClaimed).toBe(false);
        expect(object.userData.pickable).toBe(false);
        expect(object.castShadow).toBe(false);
        expect(object.receiveShadow).toBe(false);
      });
      expect(requestRender).toHaveBeenCalled();
      presentation.dispose();
      presentation.dispose();
      expect(release).toHaveBeenCalledTimes(1);
    },
  );

  it('uses the compact static herd for reduced quality and reduced motion', async () => {
    const { acquire, release } = fakeRabbitAcquirer({ animated: false });
    const presentation = createInnerKeepRabbitPresentation({
      quality: 'reduced',
      visualSeed: 17,
      reducedMotion: true,
      baseUrl: '/',
      acquirePrefab: acquire,
    });
    await presentation.ready;
    expect(acquire).toHaveBeenCalledWith(expect.objectContaining({ lod: 'compact' }));
    expect(presentation.getTelemetry()).toMatchObject({
      status: 'ready',
      lod: 'compact',
      rabbitCount: 4,
      animatedRabbitCount: 0,
      animationMixerCount: 0,
    });
    expect(presentation.isAnimationActive()).toBe(false);
    expect(presentation.update(3)).toBe(false);
    presentation.dispose();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('fails independently so the caller can retain procedural wildlife', async () => {
    const presentation = createInnerKeepRabbitPresentation({
      quality: 'balanced',
      visualSeed: 44,
      reducedMotion: false,
      baseUrl: '/',
      acquirePrefab: vi.fn(async () => {
        throw new Error('fixture unavailable');
      }),
    });
    await presentation.ready;
    expect(presentation.getTelemetry()).toMatchObject({
      status: 'failed',
      rabbitCount: 0,
      runtimeAssetFailureCount: 1,
      failureMessage: 'fixture unavailable',
    });
    presentation.dispose();
  });

  it('does not start exact loading for a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const acquire = vi.fn<AcquireInnerKeepRabbitPrefab>();
    let proceduralWildlifeVisible = true;
    const presentation = createInnerKeepRabbitPresentation({
      quality: 'high',
      visualSeed: 73,
      reducedMotion: false,
      baseUrl: '/',
      signal: controller.signal,
      acquirePrefab: acquire,
      onTelemetryChange: ({ status }) => {
        proceduralWildlifeVisible = status !== 'ready';
      },
    });

    await presentation.ready;

    expect(acquire).not.toHaveBeenCalled();
    expect(presentation.getTelemetry()).toMatchObject({
      status: 'aborted',
      rabbitCount: 0,
      animationMixerCount: 0,
      runtimeAssetFailureCount: 0,
    });
    expect(presentation.group.children).toHaveLength(0);
    expect(proceduralWildlifeVisible).toBe(true);
    presentation.dispose();
  });

  it('cleans a partial herd and releases its lease when clone setup fails', async () => {
    const { acquire, release, cloneCount } = fakeRabbitAcquirer({ failCloneAt: 2 });
    const stopAllAction = vi.spyOn(THREE.AnimationMixer.prototype, 'stopAllAction');
    const uncacheRoot = vi.spyOn(THREE.AnimationMixer.prototype, 'uncacheRoot');
    const requestRender = vi.fn();
    let proceduralWildlifeVisible = true;
    const presentation = createInnerKeepRabbitPresentation({
      quality: 'balanced',
      visualSeed: 52,
      reducedMotion: false,
      baseUrl: '/',
      acquirePrefab: acquire,
      requestRender,
      onTelemetryChange: ({ status }) => {
        proceduralWildlifeVisible = status !== 'ready';
      },
    });

    await presentation.ready;

    expect(cloneCount()).toBe(2);
    expect(stopAllAction).toHaveBeenCalledTimes(1);
    expect(uncacheRoot).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(presentation.getTelemetry()).toMatchObject({
      status: 'failed',
      rabbitCount: 0,
      animationMixerCount: 0,
      runtimeAssetFailureCount: 1,
      failureMessage: 'rabbit clone failed',
    });
    expect(presentation.group.children).toHaveLength(0);
    expect(proceduralWildlifeVisible).toBe(true);
    expect(requestRender).toHaveBeenCalledTimes(1);

    presentation.dispose();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('can be disabled without starting an asset request', async () => {
    const acquire = vi.fn<AcquireInnerKeepRabbitPrefab>();
    const presentation = createInnerKeepRabbitPresentation({
      quality: 'high',
      visualSeed: 1,
      reducedMotion: false,
      baseUrl: '/',
      loadExactAsset: false,
      acquirePrefab: acquire,
    });
    await presentation.ready;
    expect(acquire).not.toHaveBeenCalled();
    expect(presentation.getTelemetry().status).toBe('disabled');
    presentation.dispose();
  });
});
