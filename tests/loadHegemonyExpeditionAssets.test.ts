import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parserState = vi.hoisted(() => ({ calls: 0 }));

vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const THREE = await vi.importActual<typeof import('three')>('three');
  return {
    GLTFLoader: class {
      setMeshoptDecoder() {}

      async parseAsync() {
        parserState.calls += 1;
        const scene = new THREE.Group();
        scene.add(new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial(),
        ));
        return { scene, animations: [] };
      }
    },
  };
});

vi.mock('three/addons/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));

import {
  HEGEMONY_GOLD_MINE_RUNTIME_ASSETS,
  acquireHegemonyExpeditionPrefab,
  clearHegemonyExpeditionAssetBinaryCacheForTests,
  clearHegemonyExpeditionPrefabCacheForTests,
  hegemonyExpeditionAssetCacheSizesForTests,
} from '../src/components/realm/loadHegemonyExpeditionAssets';

const ROOT = resolve(import.meta.dirname, '..');
const ASSET = HEGEMONY_GOLD_MINE_RUNTIME_ASSETS.compact;
const SOURCE = readFileSync(resolve(ROOT, 'public', ASSET.path));
const SOURCE_BYTES = SOURCE.buffer.slice(
  SOURCE.byteOffset,
  SOURCE.byteOffset + SOURCE.byteLength,
) as ArrayBuffer;

function options(signal?: AbortSignal) {
  return {
    label: 'test Gold Mine',
    asset: ASSET,
    materialRole: 'gathering-node' as const,
    baseUrl: '/',
    targetFootprintDiameter: 1,
    dynamicShadows: false,
    maxAnisotropy: 1,
    signal,
    requestTimeoutMs: 1_000,
  };
}

function response() {
  return new Response(SOURCE_BYTES.slice(0), {
    status: 200,
    headers: { 'content-length': String(SOURCE_BYTES.byteLength) },
  });
}

beforeEach(() => {
  parserState.calls = 0;
});

afterEach(() => {
  clearHegemonyExpeditionAssetBinaryCacheForTests();
  clearHegemonyExpeditionPrefabCacheForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Hegemony expedition asset lifecycle', () => {
  it('evicts a final aborted lease before an immediate Realm recreation', async () => {
    let transportSignal: AbortSignal | undefined;
    const firstFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        transportSignal = init?.signal ?? undefined;
        transportSignal?.addEventListener('abort', () => reject(
          Object.assign(new Error('transport cancelled'), { name: 'AbortError' }),
        ), { once: true });
      })
    ));
    vi.stubGlobal('fetch', firstFetch);
    const controller = new AbortController();
    const pending = acquireHegemonyExpeditionPrefab(options(controller.signal));

    await vi.waitFor(() => expect(firstFetch).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(transportSignal?.aborted).toBe(true);
    expect(hegemonyExpeditionAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });

    const remountFetch = vi.fn(async () => response());
    vi.stubGlobal('fetch', remountFetch);
    const remount = await acquireHegemonyExpeditionPrefab(options());
    expect(remountFetch).toHaveBeenCalledOnce();
    expect(parserState.calls).toBe(1);
    remount.release();
    expect(hegemonyExpeditionAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });
  });
});
