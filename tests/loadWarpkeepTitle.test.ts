import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearWarpkeepTitleBinaryCacheForTests,
  disposeObject3DResources,
  loadWarpkeepTitle,
  normalizeWarpkeepTitle,
  resolveWarpkeepTitleModel,
  WARPKEEP_TITLE_MODELS
} from '../src/components/title/loadWarpkeepTitle';

const ROOT = resolve(import.meta.dirname, '..');

function exactArrayBuffer(path: string): ArrayBuffer {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

afterEach(() => {
  clearWarpkeepTitleBinaryCacheForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Warpkeep title model loader', () => {
  it('selects one exact runtime asset under the active base path', () => {
    expect(resolveWarpkeepTitleModel('/Warpkeep/', 'cinematic')).toEqual({
      ...WARPKEEP_TITLE_MODELS.high,
      profile: 'high',
      url: '/Warpkeep/models/title/warpkeep-title-high.glb'
    });
    expect(resolveWarpkeepTitleModel('/', 'balanced').profile).toBe('compact');
    expect(resolveWarpkeepTitleModel('/', 'performance').profile).toBe('compact');
  });

  it('normalizes with one inner scalar while leaving layout scale independent', () => {
    const source = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2, 1),
      new THREE.MeshBasicMaterial()
    );
    source.position.set(3, 5, -2);
    const normalized = normalizeWarpkeepTitle(source, 3);
    expect(normalized.uniformScale).toBeCloseTo(1.5, 8);
    expect(normalized.safeWidth).toBeCloseTo(6, 8);
    expect(normalized.group.scale.toArray()).toEqual([1, 1, 1]);
    expect(normalized.group.children[0].scale.toArray()).toEqual([1.5, 1.5, 1.5]);
    normalized.group.scale.setScalar(0.42);
    expect(normalized.group.children[0].scale.toArray()).toEqual([1.5, 1.5, 1.5]);
    disposeObject3DResources(normalized.group);
  });

  it('loads and integrity-checks a real meshopt GLB while coalescing concurrent fetches', async () => {
    const model = WARPKEEP_TITLE_MODELS.compact;
    const bytes = exactArrayBuffer(resolve(ROOT, 'public', model.path));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.slice(0)
    }));
    vi.stubGlobal('fetch', fetchMock);
    const parser = vi.fn(async () => {
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(
        new THREE.BoxGeometry(8, 2, 0.6),
        new THREE.MeshStandardMaterial()
      ));
      return scene;
    });

    const [first, second] = await Promise.all([
      loadWarpkeepTitle({ baseUrl: '/', quality: 'balanced', targetHeight: 2.2, parser }),
      loadWarpkeepTitle({ baseUrl: '/', quality: 'performance', targetHeight: 2.2, parser })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(parser).toHaveBeenCalledTimes(2);
    expect(first.profile).toBe('compact');
    expect(second.profile).toBe('compact');
    expect(first.group.scale.toArray()).toEqual([1, 1, 1]);
    expect(first.safeWidth).toBeGreaterThan(2.2);
    disposeObject3DResources(first.group);
    disposeObject3DResources(second.group);
  });

  it('rejects wrong bytes, supports cancellation, and disposes shared resources once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(12)
    })));
    await expect(loadWarpkeepTitle({
      baseUrl: '/',
      quality: 'cinematic',
      targetHeight: 2
    })).rejects.toThrow(/integrity check/i);

    const controller = new AbortController();
    controller.abort();
    await expect(loadWarpkeepTitle({
      baseUrl: '/',
      quality: 'balanced',
      targetHeight: 2,
      signal: controller.signal
    })).rejects.toMatchObject({ name: 'AbortError' });

    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    disposeObject3DResources(root);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });
});
