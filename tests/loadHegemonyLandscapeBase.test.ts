import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearHegemonyLandscapeBaseBinaryCacheForTests,
  HEGEMONY_LANDSCAPE_BASE_RUNTIME_ASSETS,
  landscapeBaseAssetPathForQuality,
  loadHegemonyLandscapeBase,
  prepareHegemonyLandscapeBaseScene
} from '../src/components/realm/loadHegemonyLandscapeBase';
import {
  disposeRealmObject,
  HEGEMONY_MODEL_MATERIAL_CALIBRATION
} from '../src/components/realm/loadHegemonyKeep';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

const ROOT = resolve(import.meta.dirname, '..');

const ASSETS = [
  {
    quality: 'high' as const,
    path: 'public/models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb',
    bytes: 214_372,
    sha256: 'be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c',
    triangles: 3_954,
    positions: 10_681,
    atlasSize: 1_024
  },
  {
    quality: 'balanced' as const,
    path: 'public/models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb',
    bytes: 92_784,
    sha256: '179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f',
    triangles: 2_138,
    positions: 5_611,
    atlasSize: 512
  },
  {
    quality: 'reduced' as const,
    path: 'public/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb',
    bytes: 27_328,
    sha256: 'f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3',
    triangles: 714,
    positions: 1_780,
    atlasSize: 256
  }
] as const;

function readGlbJson(path: string) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function exactArrayBuffer(path: string): ArrayBuffer {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

afterEach(() => {
  clearHegemonyLandscapeBaseBinaryCacheForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Hegemony castle landscape-base runtime assets', () => {
  it('pins all three runtime LODs to their reviewed bytes and geometry', () => {
    ASSETS.forEach((asset) => {
      const path = resolve(ROOT, asset.path);
      const bytes = readFileSync(path);
      expect(statSync(path).size).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);

      const json = readGlbJson(path);
      expect(json.asset.generator).toBe('glTF-Transform v4.4.1');
      expect(json.extensionsRequired).toEqual(expect.arrayContaining([
        'EXT_meshopt_compression',
        'EXT_texture_webp',
        'KHR_mesh_quantization'
      ]));
      expect(json.scenes).toHaveLength(1);
      expect(json.nodes).toHaveLength(1);
      expect(json.meshes).toHaveLength(1);
      expect(json.materials).toHaveLength(1);
      expect(json.images).toHaveLength(2);
      const primitive = json.meshes[0].primitives[0];
      expect(json.accessors[primitive.indices].count / 3).toBe(asset.triangles);
      expect(json.accessors[primitive.indices].componentType).toBe(5_123);
      expect(json.accessors[primitive.attributes.POSITION].count).toBe(asset.positions);
      expect(json.materials[0].extras.wk_atlas_size).toBe(asset.atlasSize);
    });

    expect(HEGEMONY_LANDSCAPE_BASE_RUNTIME_ASSETS).toEqual({
      high: expect.objectContaining({ bytes: ASSETS[0].bytes, sha256: ASSETS[0].sha256 }),
      balanced: expect.objectContaining({ bytes: ASSETS[1].bytes, sha256: ASSETS[1].sha256 }),
      reduced: expect.objectContaining({ bytes: ASSETS[2].bytes, sha256: ASSETS[2].sha256 })
    });
  });

  it('selects the landscape LOD paired with each castle quality profile', () => {
    expect(landscapeBaseAssetPathForQuality('high')).toMatch(/-high-[a-f0-9]{16}\.glb$/);
    expect(landscapeBaseAssetPathForQuality('balanced'))
      .toMatch(/-balanced-[a-f0-9]{16}\.glb$/);
    expect(landscapeBaseAssetPathForQuality('reduced'))
      .toMatch(/-compact-[a-f0-9]{16}\.glb$/);
    expect(REALM_QUALITY_SPECS.high.landscapeBaseAssetPath)
      .toBe(landscapeBaseAssetPathForQuality('high'));
    expect(REALM_QUALITY_SPECS.balanced.landscapeBaseAssetPath)
      .toBe(landscapeBaseAssetPathForQuality('balanced'));
    expect(REALM_QUALITY_SPECS.reduced.landscapeBaseAssetPath)
      .toBe(landscapeBaseAssetPathForQuality('reduced'));
  });

  it('copies the exact castle-derived transform without independently normalizing the base', () => {
    const castleTransform = new THREE.Group();
    castleTransform.position.set(0.12, 0.34, -0.56);
    castleTransform.quaternion.setFromEuler(new THREE.Euler(0.1, -0.3, 0.05));
    castleTransform.scale.setScalar(0.11544);

    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      metalness: 1,
      roughness: 0.05,
      emissiveIntensity: 3
    });
    material.emissiveMap = new THREE.Texture();
    material.envMapIntensity = 4;
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(18.5, 2.3, 15.3), material);
    scene.add(mesh);

    const prepared = prepareHegemonyLandscapeBaseScene(scene, castleTransform, {
      dynamicShadows: true,
      maxAnisotropy: 16
    });

    expect(prepared).toBe(scene);
    expect(scene.position.equals(castleTransform.position)).toBe(true);
    expect(scene.quaternion.equals(castleTransform.quaternion)).toBe(true);
    expect(scene.scale.equals(castleTransform.scale)).toBe(true);
    expect(scene.position).not.toEqual(new THREE.Vector3(0, 0, 0));
    expect(mesh.userData.warpkeepPrefabRole).toBe('landscape-base');
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(material.metalness).toBe(0.92);
    expect(material.roughness).toBe(0.2);
    expect(material.envMapIntensity).toBe(1.25);
    expect(material.emissiveIntensity).toBe(1.2);
    expect(material.color.r).toBeCloseTo(
      HEGEMONY_MODEL_MATERIAL_CALIBRATION.landscapeBaseDiffuseGain,
      8
    );
    expect(material.color.g).toBeCloseTo(
      HEGEMONY_MODEL_MATERIAL_CALIBRATION.landscapeBaseDiffuseGain,
      8
    );
    expect(material.color.b).toBeCloseTo(
      HEGEMONY_MODEL_MATERIAL_CALIBRATION.landscapeBaseDiffuseGain,
      8
    );
    expect(map.anisotropy).toBe(8);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(normalMap.anisotropy).toBe(8);

    disposeRealmObject(scene);
  });

  it('rejects a non-finite, non-positive, or non-uniform castle transform', () => {
    const scene = new THREE.Group();
    const castleTransform = new THREE.Group();
    castleTransform.scale.set(1, 1.01, 1);
    expect(() => prepareHegemonyLandscapeBaseScene(scene, castleTransform, {
      dynamicShadows: false,
      maxAnisotropy: 1
    })).toThrow(/finite uniform transform/i);

    castleTransform.scale.set(0, 0, 0);
    expect(() => prepareHegemonyLandscapeBaseScene(scene, castleTransform, {
      dynamicShadows: false,
      maxAnisotropy: 1
    })).toThrow(/finite uniform transform/i);
  });

  it('rejects an empty parsed base before it can masquerade as a complete assembly', () => {
    const castleTransform = new THREE.Group();
    castleTransform.scale.setScalar(0.12);
    expect(() => prepareHegemonyLandscapeBaseScene(
      new THREE.Group(),
      castleTransform,
      { dynamicShadows: false, maxAnisotropy: 1 }
    )).toThrow(/no renderable meshes/i);
  });

  it('integrity-checks and coalesces exact same-origin bytes while parsing separate roots', async () => {
    const compact = ASSETS[2];
    const bytes = exactArrayBuffer(resolve(ROOT, compact.path));
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit
    ) => new Response(bytes.slice(0), {
      status: 200,
      headers: { 'content-length': String(bytes.byteLength) }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const parser = vi.fn(async (received: ArrayBuffer, resourcePath: string) => {
      expect(received.byteLength).toBe(compact.bytes);
      expect(resourcePath).toBe('/models/hegemony/');
      return new THREE.Group();
    });
    const options = {
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 4,
      parser
    } as const;

    const [first, second] = await Promise.all([
      loadHegemonyLandscapeBase(options),
      loadHegemonyLandscapeBase(options)
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb',
      expect.objectContaining({ credentials: 'same-origin', redirect: 'error' })
    );
    expect(parser).toHaveBeenCalledTimes(2);
    expect(first.root).not.toBe(second.root);
    expect(first.assetUrl).toBe(
      '/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb'
    );
  });

  it('aborts shared transport only after its final pending scene consumer leaves', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        requestSignal = init?.signal ?? undefined;
        requestSignal?.addEventListener('abort', () => {
          reject(requestSignal?.reason ?? new Error('synthetic transport abort'));
        }, { once: true });
      })
    ));
    vi.stubGlobal('fetch', fetchMock);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const parser = vi.fn(async () => new THREE.Group());
    const options = {
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      parser
    } as const;
    const first = loadHegemonyLandscapeBase({
      ...options,
      signal: firstController.signal
    });
    const second = loadHegemonyLandscapeBase({
      ...options,
      signal: secondController.signal
    });
    const firstRejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const secondRejection = expect(second).rejects.toMatchObject({ name: 'AbortError' });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    firstController.abort();
    await firstRejection;
    expect(requestSignal?.aborted).toBe(false);
    expect(parser).not.toHaveBeenCalled();

    secondController.abort();
    await secondRejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('isolates shared transports with different normalized timeout policies', async () => {
    vi.useFakeTimers();
    const requestSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        const requestSignal = init?.signal;
        if (!(requestSignal instanceof AbortSignal)) {
          reject(new Error('missing synthetic request signal'));
          return;
        }
        requestSignals.push(requestSignal);
        requestSignal.addEventListener('abort', () => {
          reject(requestSignal.reason ?? new Error('synthetic transport abort'));
        }, { once: true });
      })
    ));
    vi.stubGlobal('fetch', fetchMock);
    const longController = new AbortController();
    const options = {
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      parser: vi.fn(async () => new THREE.Group())
    } as const;
    const long = loadHegemonyLandscapeBase({
      ...options,
      signal: longController.signal,
      requestTimeoutMs: 1_000
    });
    const short = loadHegemonyLandscapeBase({ ...options, requestTimeoutMs: 23 });
    const longRejection = expect(long).rejects.toMatchObject({ name: 'AbortError' });
    const shortRejection = expect(short).rejects.toThrow(/timed out after 23ms/i);

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(23);
    await shortRejection;
    expect(requestSignals).toHaveLength(2);
    expect(requestSignals[0]?.aborted).toBe(false);
    expect(requestSignals[1]?.aborted).toBe(true);

    longController.abort();
    await longRejection;
    expect(requestSignals[0]?.aborted).toBe(true);
  });

  it('evicts a failed integrity request so the next scene can retry cleanly', async () => {
    const corrupt = new Uint8Array(ASSETS[2].bytes);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(corrupt, {
        status: 200,
        headers: { 'content-length': String(corrupt.byteLength) }
      }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const options = {
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      parser: vi.fn(async () => new THREE.Group())
    } as const;

    await expect(loadHegemonyLandscapeBase(options)).rejects.toThrow(/integrity check/i);
    await expect(loadHegemonyLandscapeBase(options)).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled landscape-base request and aborts the underlying fetch', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    const load = loadHegemonyLandscapeBase({
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      requestTimeoutMs: 23,
      parser: vi.fn(async () => new THREE.Group())
    });
    const rejection = expect(load).rejects.toThrow(/timed out after 23ms/i);

    await vi.advanceTimersByTimeAsync(23);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(true);
  });
});
