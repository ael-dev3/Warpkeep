import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LoadedWarpkeepTitle } from '../src/components/title/loadWarpkeepTitle';
import { createTitlePresentationController } from '../src/components/title/titlePresentationController';

function loadedTitle(
  profile: LoadedWarpkeepTitle['profile'],
  opacity = 0.8
) {
  const material = new THREE.MeshBasicMaterial({ opacity });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  return {
    loaded: {
      group,
      safeWidth: profile === 'high' ? 12 : 10,
      uniformScale: 1,
      profile
    } satisfies LoadedWarpkeepTitle,
    material
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('title presentation controller', () => {
  it('compiles and reveals the real title without mounting a procedural stage first', async () => {
    vi.useFakeTimers();
    let now = 0;
    const compact = loadedTitle('compact', 0.72);
    const scene = new THREE.Scene();
    const controller = createTitlePresentationController({
      scene,
      camera: new THREE.PerspectiveCamera(),
      renderer: { compile: vi.fn() },
      baseUrl: '/',
      initialQuality: 'balanced',
      reducedMotion: false,
      createFallback: vi.fn(() => {
        throw new Error('fallback should not be created');
      }),
      now: () => now,
      loadTitle: vi.fn(async () => compact.loaded)
    });

    expect(controller.stage.children).toHaveLength(0);
    await settle();
    expect(controller.getState().phase).toBe('model-revealing');
    expect(controller.stage.children).toEqual([compact.loaded.group]);
    expect(compact.material.opacity).toBe(0);

    now = 400;
    expect(controller.update(now)).toBe(true);
    expect(compact.material.opacity).toBeCloseTo(0.36, 8);
    now = 800;
    expect(controller.update(now)).toBe(false);
    expect(controller.getState().phase).toBe('model-ready');
    expect(compact.material.opacity).toBeCloseTo(0.72, 8);
    controller.dispose();
  });

  it('waits for the bounded fallback boundary after an early model failure', async () => {
    vi.useFakeTimers();
    let now = 0;
    const fallback = loadedTitle('compact', 0.64);
    const createFallback = vi.fn(() => ({
      group: fallback.loaded.group,
      safeWidth: fallback.loaded.safeWidth
    }));
    const controller = createTitlePresentationController({
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      renderer: { compile: vi.fn() },
      baseUrl: '/',
      initialQuality: 'balanced',
      reducedMotion: false,
      createFallback,
      now: () => now,
      loadTitle: vi.fn(async () => {
        throw new Error('offline');
      })
    });

    await settle();
    expect(controller.getState().phase).toBe('model-failed-waiting');
    expect(createFallback).not.toHaveBeenCalled();

    now = 10_000;
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(createFallback).toHaveBeenCalledTimes(1);
    expect(controller.getState().phase).toBe('fallback-revealing');
    expect(fallback.material.opacity).toBe(0);

    now = 10_800;
    controller.update(now);
    expect(controller.getState().phase).toBe('fallback-ready');
    expect(fallback.material.opacity).toBeCloseTo(0.64, 8);
    controller.dispose();
  });

  it('keeps the active model visible while a different quality compiles and crossfades', async () => {
    vi.useFakeTimers();
    let now = 0;
    const compact = loadedTitle('compact');
    const high = loadedTitle('high');
    const loadTitle = vi.fn(async ({ quality }: { quality: string }) => (
      quality === 'cinematic' ? high.loaded : compact.loaded
    ));
    const controller = createTitlePresentationController({
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      renderer: { compile: vi.fn() },
      baseUrl: '/',
      initialQuality: 'balanced',
      reducedMotion: false,
      createFallback: () => ({ group: new THREE.Group(), safeWidth: 10 }),
      now: () => now,
      loadTitle: loadTitle as never
    });

    await settle();
    now = 800;
    controller.update(now);
    expect(controller.getState().phase).toBe('model-ready');

    controller.setQuality('performance');
    expect(loadTitle).toHaveBeenCalledTimes(1);
    controller.setQuality('cinematic');
    await settle();
    expect(loadTitle).toHaveBeenCalledTimes(2);
    expect(controller.getState().phase).toBe('replacement-crossfading');
    expect(controller.stage.children).toHaveLength(2);
    expect(compact.material.opacity).toBeCloseTo(0.8, 8);
    expect(high.material.opacity).toBe(0);

    now = 1_200;
    controller.update(now);
    expect(compact.material.opacity).toBeCloseTo(0.4, 8);
    expect(high.material.opacity).toBeCloseTo(0.4, 8);
    now = 1_600;
    controller.update(now);
    expect(controller.getState().phase).toBe('model-ready');
    expect(controller.getState().activeProfile).toBe('high');
    expect(controller.stage.children).toEqual([high.loaded.group]);
    expect(high.material.opacity).toBeCloseTo(0.8, 8);
    controller.dispose();
  });

  it('cancels a crossfade when quality returns to the active model profile', async () => {
    vi.useFakeTimers();
    let now = 0;
    const compact = loadedTitle('compact');
    const high = loadedTitle('high');
    const loadTitle = vi.fn(async ({ quality }: { quality: string }) => (
      quality === 'cinematic' ? high.loaded : compact.loaded
    ));
    const scene = new THREE.Scene();
    const controller = createTitlePresentationController({
      scene,
      camera: new THREE.PerspectiveCamera(),
      renderer: { compile: vi.fn() },
      baseUrl: '/',
      initialQuality: 'balanced',
      reducedMotion: false,
      createFallback: () => ({ group: new THREE.Group(), safeWidth: 10 }),
      now: () => now,
      loadTitle: loadTitle as never
    });

    await settle();
    now = 800;
    controller.update(now);
    controller.setQuality('cinematic');
    await settle();
    expect(controller.getState().phase).toBe('replacement-crossfading');

    now = 1_000;
    controller.update(now);
    expect(compact.material.opacity).toBeLessThan(0.8);
    expect(high.material.opacity).toBeGreaterThan(0);

    controller.setQuality('balanced');
    expect(controller.getState().phase).toBe('model-ready');
    expect(controller.getState().activeProfile).toBe('compact');
    expect(controller.stage.children).toEqual([compact.loaded.group]);
    expect(compact.material.opacity).toBeCloseTo(0.8, 8);

    now = 2_000;
    expect(controller.update(now)).toBe(false);
    expect(controller.getState().activeProfile).toBe('compact');
    controller.dispose();
    expect(scene.children).not.toContain(controller.stage);
  });

  it('shows the procedural fallback when synchronous shader preparation fails', async () => {
    vi.useFakeTimers();
    let now = 0;
    const fallback = loadedTitle('compact');
    const controller = createTitlePresentationController({
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      renderer: { compile: vi.fn(() => { throw new Error('shader rejected'); }) },
      baseUrl: '/',
      initialQuality: 'balanced',
      reducedMotion: false,
      createFallback: () => ({
        group: fallback.loaded.group,
        safeWidth: fallback.loaded.safeWidth
      }),
      now: () => now,
      loadTitle: vi.fn(async () => { throw new Error('offline'); })
    });

    await settle();
    now = 10_000;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(controller.getState().phase).toBe('fallback-ready');
    expect(controller.getState().failure).toBe('shader rejected');
    expect(fallback.material.opacity).toBeCloseTo(0.8, 8);
    controller.dispose();
  });
});
