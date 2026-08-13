import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acquireInnerKeepRabbitPrefab,
  clearInnerKeepRabbitAssetCachesForTests,
  innerKeepRabbitAssetCacheSizesForTests,
} from '../src/components/inner-keep/loadInnerKeepRabbitAssets';
import { innerKeepRabbitModel } from '../src/components/inner-keep/innerKeepRabbitRuntimeAssets';

const ROOT = resolve(import.meta.dirname, '..');
const BASE_URL = 'https://warpkeep.example/game/';

function exactLocalFetcher(tamper = false): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const marker = '/game/';
    const relativePath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
    const source = new Uint8Array(await readFile(resolve(ROOT, 'public', relativePath)));
    const bytes = source.slice();
    if (tamper) bytes[bytes.length - 1] ^= 0xff;
    return new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.byteLength) },
    });
  }) as typeof fetch;
}

afterEach(() => {
  clearInnerKeepRabbitAssetCachesForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Inner Keep Lowlands Rabbit asset lifecycle', () => {
  it('loads one shared Balanced rig and creates skeleton-safe animated clones', async () => {
    const fetcher = exactLocalFetcher();
    vi.stubGlobal('fetch', fetcher);
    const first = acquireInnerKeepRabbitPrefab({ lod: 'balanced', baseUrl: BASE_URL });
    const second = acquireInnerKeepRabbitPrefab({ lod: 'balanced', baseUrl: BASE_URL });
    const [firstLease, secondLease] = await Promise.all([first, second]);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(firstLease.prefab).toBe(secondLease.prefab);
    expect(firstLease.prefab).toMatchObject({
      lod: 'balanced',
      animated: true,
      triangles: 350,
    });
    expect(firstLease.prefab.clips.map((clip) => clip.name).sort()).toEqual([
      'Alert', 'Idle', 'Nibble', 'Walk',
    ]);
    const firstClone = firstLease.prefab.clone();
    const secondClone = firstLease.prefab.clone();
    const firstSkeletons: unknown[] = [];
    const secondSkeletons: unknown[] = [];
    firstClone.traverse((object) => {
      if ('skeleton' in object) firstSkeletons.push(object.skeleton);
    });
    secondClone.traverse((object) => {
      if ('skeleton' in object) secondSkeletons.push(object.skeleton);
    });
    expect(firstSkeletons).toHaveLength(1);
    expect(secondSkeletons).toHaveLength(1);
    expect(firstSkeletons[0]).not.toBe(secondSkeletons[0]);
    expect(firstLease.prefab.sourceRoot.userData).toMatchObject({
      presentationOnly: true,
      gameplayAuthority: false,
    });

    firstLease.release();
    expect(innerKeepRabbitAssetCacheSizesForTests().prefabs).toBe(1);
    secondLease.release();
    expect(innerKeepRabbitAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });
  });

  it('loads the Compact static fallback without animation or a skin', async () => {
    vi.stubGlobal('fetch', exactLocalFetcher());
    const lease = await acquireInnerKeepRabbitPrefab({
      lod: 'compact',
      baseUrl: BASE_URL,
    });
    expect(lease.prefab).toMatchObject({
      lod: 'compact',
      animated: false,
      triangles: 146,
    });
    expect(lease.prefab.clips).toEqual([]);
    const clone = lease.prefab.clone();
    let skinned = 0;
    clone.traverse((object) => {
      if ('skeleton' in object) skinned += 1;
    });
    expect(skinned).toBe(0);
    lease.release();
  });

  it('rejects changed bytes before parsing and evicts the failed cache entry', async () => {
    vi.stubGlobal('fetch', exactLocalFetcher(true));
    await expect(acquireInnerKeepRabbitPrefab({
      lod: 'compact',
      baseUrl: BASE_URL,
    })).rejects.toThrow(/SHA-256 integrity check/i);
    expect(innerKeepRabbitAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });
  });

  it('lets the final pending caller abort the shared transport and remount cleanly', async () => {
    let transportSignal: AbortSignal | undefined;
    const pendingFetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        transportSignal = init?.signal ?? undefined;
        transportSignal?.addEventListener('abort', () => reject(
          Object.assign(new Error('transport cancelled'), { name: 'AbortError' }),
        ), { once: true });
      })
    ));
    vi.stubGlobal('fetch', pendingFetcher);
    const controller = new AbortController();
    const pending = acquireInnerKeepRabbitPrefab({
      lod: 'compact',
      baseUrl: BASE_URL,
      signal: controller.signal,
      requestTimeoutMs: 1_000,
    });
    await vi.waitFor(() => expect(pendingFetcher).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(transportSignal?.aborted).toBe(true);
    expect(innerKeepRabbitAssetCacheSizesForTests()).toEqual({
      binaryRequests: 0,
      prefabs: 0,
    });

    const remountFetcher = exactLocalFetcher();
    vi.stubGlobal('fetch', remountFetcher);
    const remount = await acquireInnerKeepRabbitPrefab({
      lod: 'compact',
      baseUrl: BASE_URL,
    });
    expect(remountFetcher).toHaveBeenCalledOnce();
    remount.release();
  });

  it('resolves only the catalogued content-addressed same-origin path', () => {
    const model = innerKeepRabbitModel('balanced');
    expect(model.path).toBe(
      'models/hegemony/inner-keep/wildlife/rabbit/'
        + 'inner-keep-lowlands-rabbit-balanced-daeb493a827ecbd6.glb',
    );
    expect(model.path).not.toMatch(/^https?:/u);
    expect(model.path).not.toContain('..');
  });
});
