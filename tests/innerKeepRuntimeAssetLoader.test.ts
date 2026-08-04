import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { disposeRealmObjectSpy } = vi.hoisted(() => ({
  disposeRealmObjectSpy: vi.fn(),
}));

vi.mock('../src/components/realm/loadHegemonyKeep', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('../src/components/realm/loadHegemonyKeep')
  >();
  return {
    ...original,
    disposeRealmObject: (root: THREE.Object3D) => {
      disposeRealmObjectSpy(root);
      original.disposeRealmObject(root);
    },
  };
});

import {
  loadInnerKeepRuntimeAssetBundle,
} from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';
import {
  INNER_KEEP_POPULATION_RUNTIME_ACTORS,
  INNER_KEEP_POPULATION_RUNTIME_SELECTION_DIGEST,
  INNER_KEEP_STATIC_RUNTIME_ASSETS,
  INNER_KEEP_STATIC_RUNTIME_SELECTION_DIGEST,
} from '../src/components/inner-keep/innerKeepRuntimeAssetCatalog.generated';

const repositoryRoot = resolve(import.meta.dirname, '..');
const baseUrl = 'https://warpkeep.example/game/';

afterEach(() => {
  vi.restoreAllMocks();
  disposeRealmObjectSpy.mockClear();
});

function deferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function exactLocalFetcher(tamper = false): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const marker = '/game/';
    const relativePath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
    const source = new Uint8Array(await readFile(resolve(repositoryRoot, 'public', relativePath)));
    const bytes = source.slice();
    if (tamper) bytes[bytes.length - 1] ^= 0xff;
    return new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.byteLength) },
    });
  }) as typeof fetch;
}

describe('Inner Keep browser runtime asset loader', () => {
  it('pins the generated browser catalog to the two exact authorized selections', () => {
    expect(INNER_KEEP_STATIC_RUNTIME_SELECTION_DIGEST).toBe(
      '00304c5dbf819cec6cb656996c1105f64efcf36acf8099c431f5b04b822679f0',
    );
    expect(INNER_KEEP_POPULATION_RUNTIME_SELECTION_DIGEST).toBe(
      '79237fbe85a4db7a0592eb0c27cc00f8e72e85e58be867bec4dd35992f0b87f7',
    );
    expect(INNER_KEEP_STATIC_RUNTIME_ASSETS).toHaveLength(38);
    expect(INNER_KEEP_POPULATION_RUNTIME_ACTORS).toHaveLength(20);
    expect(INNER_KEEP_STATIC_RUNTIME_ASSETS.every((asset) => (
      Object.values(asset.models).every((model) => (
        model.path.endsWith(`-${model.sha256.slice(0, 16)}.glb`)
        && !model.path.startsWith('/')
      ))
    ))).toBe(true);
  });

  it('integrity-checks, parses, grounds, and clones a compact authored prop', async () => {
    const bundle = await loadInnerKeepRuntimeAssetBundle({
      quality: 'reduced',
      reducedMotion: true,
      baseUrl,
      staticAssetIds: ['dirt-road-straight-4m'],
      populationActorIds: [],
      fetcher: exactLocalFetcher(),
      concurrency: 1,
    });
    expect(bundle.failures).toEqual([]);
    const prefab = bundle.staticPrefabs.get('dirt-road-straight-4m');
    expect(prefab).toBeDefined();
    expect(prefab?.animated).toBe(false);
    expect(prefab).toMatchObject({ triangles: 108, drawCalls: 1 });
    const clone = prefab!.clone();
    expect(clone).not.toBe(prefab?.root);
    expect(clone.children.length).toBeGreaterThan(0);
    clone.removeFromParent();
    bundle.dispose();
  });

  it('uses the compact static population fallback for reduced motion', async () => {
    const bundle = await loadInnerKeepRuntimeAssetBundle({
      quality: 'balanced',
      reducedMotion: true,
      baseUrl,
      staticAssetIds: [],
      populationActorIds: ['basilica-warden'],
      fetcher: exactLocalFetcher(),
      concurrency: 1,
    });
    expect(bundle.failures).toEqual([]);
    const prefab = bundle.populationPrefabs.get('basilica-warden');
    expect(prefab).toMatchObject({
      animated: false,
      mounted: false,
      triangles: 884,
      drawCalls: 7,
    });
    expect(prefab?.clips).toHaveLength(0);
    bundle.dispose();
  });

  it('loads the attested rig and civic clips for a moving citizen', async () => {
    const bundle = await loadInnerKeepRuntimeAssetBundle({
      quality: 'balanced',
      reducedMotion: false,
      baseUrl,
      staticAssetIds: [],
      populationActorIds: ['basilica-warden'],
      fetcher: exactLocalFetcher(),
      concurrency: 1,
    });
    expect(bundle.failures).toEqual([]);
    const prefab = bundle.populationPrefabs.get('basilica-warden');
    expect(prefab).toMatchObject({ animated: true, mounted: false, triangles: 1_452 });
    expect(prefab?.clips.map(({ name }) => name).sort()).toEqual([
      'Greet', 'Idle', 'Walk', 'Work',
    ]);
    const clone = prefab!.clone();
    let skinnedMeshCount = 0;
    clone.traverse((object) => {
      if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh === true) {
        skinnedMeshCount += 1;
      }
    });
    expect(skinnedMeshCount).toBeGreaterThan(0);
    bundle.dispose();
  });

  it('isolates an integrity failure so the procedural fail-safe can remain', async () => {
    const bundle = await loadInnerKeepRuntimeAssetBundle({
      quality: 'reduced',
      reducedMotion: false,
      baseUrl,
      staticAssetIds: ['dirt-road-straight-4m'],
      populationActorIds: [],
      fetcher: exactLocalFetcher(true),
      concurrency: 1,
    });
    expect(bundle.staticPrefabs.size).toBe(0);
    expect(bundle.failures).toEqual([
      expect.objectContaining({
        kind: 'static',
        id: 'dirt-road-straight-4m',
        reason: expect.stringContaining('SHA-256'),
      }),
    ]);
    bundle.dispose();
  });

  it('retries one transient request before reporting a partial bundle', async () => {
    const localFetcher = exactLocalFetcher();
    let attempts = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      attempts += 1;
      if (attempts === 1) return new Response(null, { status: 503 });
      return localFetcher(input, init);
    }) as typeof fetch;
    const bundle = await loadInnerKeepRuntimeAssetBundle({
      quality: 'reduced',
      reducedMotion: false,
      baseUrl,
      staticAssetIds: ['dirt-road-straight-4m'],
      populationActorIds: [],
      fetcher,
      concurrency: 1,
    });
    expect(attempts).toBe(2);
    expect(bundle.failures).toEqual([]);
    expect(bundle.staticPrefabs.has('dirt-road-straight-4m')).toBe(true);
    bundle.dispose();
  });

  it('retires every request transport before starting or completing an attempt', async () => {
    const localFetcher = exactLocalFetcher();
    const signals: AbortSignal[] = [];
    let cancelledErrorBodyCount = 0;
    let attempts = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      attempts += 1;
      if (init?.signal) signals.push(init.signal);
      if (attempts === 1) {
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
          },
          cancel() {
            cancelledErrorBodyCount += 1;
          },
        }), { status: 503 });
      }
      return localFetcher(input, init);
    }) as typeof fetch;
    const bundle = await loadInnerKeepRuntimeAssetBundle({
      quality: 'reduced',
      reducedMotion: false,
      baseUrl,
      staticAssetIds: ['dirt-road-straight-4m'],
      populationActorIds: [],
      fetcher,
      concurrency: 1,
    });

    expect(attempts).toBe(2);
    expect(cancelledErrorBodyCount).toBe(1);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(bundle.failures).toEqual([]);
    bundle.dispose();
  });

  it('shares one bounded, static-first queue while overlapping the two asset families', async () => {
    const localFetcher = exactLocalFetcher();
    const releaseFirstStatic = deferred<void>();
    const populationRequested = deferred<void>();
    const requestedPaths: string[] = [];
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      requestedPaths.push(path);
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      try {
        if (path.includes('dirt-road-straight-4m')) {
          await releaseFirstStatic.promise;
        }
        if (path.includes('/population/')) populationRequested.resolve();
        return await localFetcher(input, init);
      } finally {
        activeRequests -= 1;
      }
    }) as typeof fetch;
    const loading = loadInnerKeepRuntimeAssetBundle({
      quality: 'reduced',
      reducedMotion: true,
      baseUrl,
      staticAssetIds: ['dirt-road-straight-4m', 'dirt-road-curve-90-4m'],
      populationActorIds: ['basilica-warden'],
      fetcher,
      concurrency: 2,
    });
    await Promise.race([
      populationRequested.promise,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('population request did not overlap the held static request')),
        5_000,
      )),
    ]);
    releaseFirstStatic.resolve();
    const bundle = await loading;
    expect(requestedPaths.slice(0, 2).every((path) => !path.includes('/population/'))).toBe(true);
    expect(requestedPaths[2]).toContain('/population/');
    expect(maximumActiveRequests).toBe(2);
    expect(bundle.staticPrefabs.size).toBe(2);
    expect(bundle.populationPrefabs.size).toBe(1);
    bundle.dispose();
  });

  it('reports isolated failures in selection order regardless of completion order', async () => {
    const pending = new Map<string, ReturnType<typeof deferred<Response>>>();
    const allRequested = deferred<void>();
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      const response = deferred<Response>();
      pending.set(path, response);
      if (pending.size === 3) allRequested.resolve();
      return response.promise;
    }) as typeof fetch;
    const loading = loadInnerKeepRuntimeAssetBundle({
      quality: 'reduced',
      reducedMotion: true,
      baseUrl,
      staticAssetIds: ['dirt-road-straight-4m', 'dirt-road-curve-90-4m'],
      populationActorIds: ['basilica-warden'],
      fetcher,
      concurrency: 3,
    });
    await allRequested.promise;
    const entries = [...pending.entries()];
    entries.find(([path]) => path.includes('/population/'))![1].resolve(
      new Response(null, { status: 404 }),
    );
    entries.find(([path]) => path.includes('dirt-road-curve-90-4m'))![1].resolve(
      new Response(null, { status: 404 }),
    );
    entries.find(([path]) => path.includes('dirt-road-straight-4m'))![1].resolve(
      new Response(null, { status: 404 }),
    );
    const bundle = await loading;
    expect(bundle.failures.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      'static:dirt-road-straight-4m',
      'static:dirt-road-curve-90-4m',
      'population:basilica-warden',
    ]);
    bundle.dispose();
  });

  it('drains in-flight workers and disposes every parsed source on mid-flight abort', async () => {
    const controller = new AbortController();
    const localFetcher = exactLocalFetcher();
    const heldRequestStarted = deferred<void>();
    const sourcePrepared = deferred<void>();
    const originalAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (
      this: THREE.Object3D,
      ...objects: THREE.Object3D[]
    ) {
      const result = originalAdd.apply(this, objects);
      if (this.name.startsWith('inner-keep-runtime-source:')) sourcePrepared.resolve();
      return result;
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (!path.includes('dirt-road-curve-90-4m')) return localFetcher(input, init);
      heldRequestStarted.resolve();
      return new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () => reject(new DOMException('cancelled', 'AbortError'));
        if (init?.signal?.aborted) rejectAbort();
        else init?.signal?.addEventListener('abort', rejectAbort, { once: true });
      });
    }) as typeof fetch;
    const loading = loadInnerKeepRuntimeAssetBundle({
      quality: 'reduced',
      reducedMotion: true,
      baseUrl,
      staticAssetIds: ['dirt-road-straight-4m', 'dirt-road-curve-90-4m'],
      populationActorIds: [],
      signal: controller.signal,
      fetcher,
      concurrency: 2,
    });
    await Promise.all([heldRequestStarted.promise, sourcePrepared.promise]);
    controller.abort();
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(disposeRealmObjectSpy).toHaveBeenCalledTimes(1);
    expect(disposeRealmObjectSpy.mock.calls[0]?.[0]).toMatchObject({
      name: expect.stringContaining('inner-keep-runtime-source:'),
      parent: null,
    });
  });

  it('cancels before issuing any network request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = exactLocalFetcher();
    await expect(loadInnerKeepRuntimeAssetBundle({
      quality: 'high',
      reducedMotion: false,
      baseUrl,
      staticAssetIds: ['grand-covenant-cathedral'],
      populationActorIds: [],
      signal: controller.signal,
      fetcher,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
