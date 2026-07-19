import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parserState = vi.hoisted(() => ({
  calls: 0,
  deferred: undefined as Promise<void> | undefined,
  geometries: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
  materials: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const THREE = await vi.importActual<typeof import('three')>('three');
  return {
    GLTFLoader: class {
      setMeshoptDecoder() {}

      async parseAsync() {
        parserState.calls += 1;
        await parserState.deferred;
        const scene = new THREE.Group();
        const geometry = new THREE.BoxGeometry(1, 3, 1);
        const material = new THREE.MeshStandardMaterial();
        const geometryDispose = vi.spyOn(geometry, 'dispose');
        const materialDispose = vi.spyOn(material, 'dispose');
        parserState.geometries.push({ dispose: geometryDispose });
        parserState.materials.push({ dispose: materialDispose });
        scene.add(new THREE.Mesh(geometry, material));
        return { scene };
      }
    }
  };
});

vi.mock('three/addons/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));

import {
  acquireHegemonyTreePrefab,
  clearHegemonyTreeAssetCachesForTests,
  hegemonyTreeAssetCacheSizesForTests,
} from '../src/components/realm/loadHegemonyTreeAssets';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  hegemonyTreeModel,
} from '../src/components/realm/hegemonyTreeRuntimeAssets';

const ROOT = resolve(import.meta.dirname, '..');
const ASSET = HEGEMONY_TREE_RUNTIME_ASSETS[0]!;
const MODEL = hegemonyTreeModel(ASSET, 'compact');
const SOURCE = readFileSync(resolve(ROOT, MODEL.path));
const SOURCE_BYTES = SOURCE.buffer.slice(
  SOURCE.byteOffset,
  SOURCE.byteOffset + SOURCE.byteLength,
) as ArrayBuffer;

function options(signal?: AbortSignal) {
  return {
    asset: ASSET,
    lod: 'compact' as const,
    baseUrl: '/',
    signal,
    requestTimeoutMs: 1_000,
  };
}

function response(bytes = SOURCE_BYTES) {
  return new Response(bytes.slice(0), {
    status: 200,
    headers: { 'content-length': String(bytes.byteLength) },
  });
}

beforeEach(() => {
  parserState.calls = 0;
  parserState.deferred = undefined;
  parserState.geometries = [];
  parserState.materials = [];
});

afterEach(() => {
  clearHegemonyTreeAssetCachesForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Hegemony tree asset lifecycle', () => {
  it('aborts the underlying first load after its final pending lease leaves, then remounts cleanly', async () => {
    let transportSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        transportSignal = init?.signal ?? undefined;
        transportSignal?.addEventListener('abort', () => reject(
          Object.assign(new Error('transport cancelled'), { name: 'AbortError' }),
        ), { once: true });
      })
    ));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const pending = acquireHegemonyTreePrefab(options(controller.signal));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(transportSignal?.aborted).toBe(true);
    // The rejected prefab entry must be gone synchronously so a same-task
    // Realm recreation cannot inherit its already-aborted promise.
    expect(hegemonyTreeAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });

    const remountFetch = vi.fn(async () => response());
    vi.stubGlobal('fetch', remountFetch);
    const remount = await acquireHegemonyTreePrefab(options());
    expect(remountFetch).toHaveBeenCalledOnce();
    expect(parserState.calls).toBe(1);
    remount.release();
    expect(hegemonyTreeAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });
  });

  it('keeps shared transport alive when only one of two pending leases aborts', async () => {
    let transportSignal: AbortSignal | undefined;
    let resolveTransport: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      transportSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolveResponse, reject) => {
        resolveTransport = resolveResponse;
        transportSignal?.addEventListener('abort', () => reject(
          Object.assign(new Error('transport cancelled'), { name: 'AbortError' }),
        ), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = acquireHegemonyTreePrefab(options(firstController.signal));
    const second = acquireHegemonyTreePrefab(options(secondController.signal));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(transportSignal?.aborted).toBe(false);

    resolveTransport?.(response());
    const secondLease = await second;
    expect(parserState.calls).toBe(1);
    secondLease.release();
    expect(hegemonyTreeAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });
  });

  it('disposes a late parse after the final lease aborts', async () => {
    let finishParse: (() => void) | undefined;
    parserState.deferred = new Promise<void>((resolveParse) => {
      finishParse = resolveParse;
    });
    vi.stubGlobal('fetch', vi.fn(async () => response()));
    const controller = new AbortController();
    const pending = acquireHegemonyTreePrefab(options(controller.signal));

    await vi.waitFor(() => expect(parserState.calls).toBe(1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    finishParse?.();
    await vi.waitFor(() => expect(parserState.geometries).toHaveLength(1));
    await vi.waitFor(() => expect(parserState.geometries[0]!.dispose).toHaveBeenCalled());
    expect(parserState.materials[0]!.dispose).toHaveBeenCalled();
    expect(hegemonyTreeAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });
  });

  it('evicts corrupt bytes without parsing or retaining cache state', async () => {
    const corrupt = SOURCE_BYTES.slice(0);
    new Uint8Array(corrupt)[corrupt.byteLength - 1] ^= 0xff;
    vi.stubGlobal('fetch', vi.fn(async () => response(corrupt)));

    await expect(acquireHegemonyTreePrefab(options())).rejects.toThrow(/integrity check/i);
    expect(parserState.calls).toBe(0);
    expect(hegemonyTreeAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });
  });
});
