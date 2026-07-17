import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  calculateKeepNormalization,
  clearHegemonyKeepBinaryCacheForTests,
  disposeRealmObject,
  HEGEMONY_MODEL_MATERIAL_CALIBRATION,
  keepAssetPathForQuality,
  loadHegemonyKeep,
  prepareHegemonyKeepScene,
  resolveIntegrityPinnedRealmAssetUrl,
  resolveRealmAssetUrl,
  tuneHegemonyModelMaterial
} from '../src/components/realm/loadHegemonyKeep';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

const ROOT = resolve(import.meta.dirname, '..');

const ASSETS = [
  {
    quality: 'high' as const,
    path: 'public/models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb',
    bytes: 2_215_972,
    sha256: '9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8',
    triangles: 72_850,
    vertices: 171_554,
    indexComponentType: 5_125,
    maxBytes: 2_250_000
  },
  {
    quality: 'balanced' as const,
    path: 'public/models/hegemony/hegemony-main-castle-balanced-a9df1a9acd36e720.glb',
    bytes: 892_788,
    sha256: 'a9df1a9acd36e7208b764396854053a6e3c591f2eb04a83a6e2437c55a3aa157',
    triangles: 32_550,
    vertices: 67_687,
    indexComponentType: 5_125,
    maxBytes: 1_200_000
  },
  {
    quality: 'reduced' as const,
    path: 'public/models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb',
    bytes: 453_628,
    sha256: 'b665d75e10e3e289dac09ebb9f0eeec75469dda77fb25265b03b5ad6081c627b',
    triangles: 17_232,
    vertices: 34_800,
    indexComponentType: 5_123,
    maxBytes: 520_000
  }
];

function readGlbJson(path: string) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

afterEach(() => {
  clearHegemonyKeepBinaryCacheForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Hegemony keep runtime assets', () => {
  it('does not ship the retired unresolved-rights Frontier Keep derivatives', () => {
    for (const profile of ['high', 'balanced', 'compact']) {
      expect(existsSync(resolve(
        ROOT,
        `public/models/hegemony/hegemony-frontier-keep-${profile}.glb`
      ))).toBe(false);
    }
  });

  it('ships validated high, balanced, and reduced assets inside their transfer budgets', () => {
    ASSETS.forEach((asset) => {
      const path = resolve(ROOT, asset.path);
      const bytes = readFileSync(path);
      expect(statSync(path).size).toBe(asset.bytes);
      expect(asset.bytes).toBeLessThan(asset.maxBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      const json = readGlbJson(path);
      expect(json.extensionsRequired).toEqual(expect.arrayContaining([
        'EXT_meshopt_compression',
        'EXT_texture_webp',
        'KHR_mesh_quantization'
      ]));
      expect(json.scenes).toHaveLength(1);
      expect(json.meshes).toHaveLength(1);
      expect(json.images).toHaveLength(2);
      const primitive = json.meshes[0].primitives[0];
      expect(json.accessors[primitive.indices].count / 3).toBe(asset.triangles);
      expect(json.accessors[primitive.indices].componentType).toBe(asset.indexComponentType);
      expect(json.accessors[primitive.attributes.POSITION].count).toBe(asset.vertices);
    });
  });

  it('selects only one LOD and resolves it under the active Vite base path', () => {
    expect(keepAssetPathForQuality('high')).toMatch(/-high-[a-f0-9]{16}\.glb$/);
    expect(keepAssetPathForQuality('balanced')).toMatch(/-balanced-[a-f0-9]{16}\.glb$/);
    expect(keepAssetPathForQuality('reduced')).toMatch(/-compact-[a-f0-9]{16}\.glb$/);
    expect(resolveRealmAssetUrl('/Warpkeep/', keepAssetPathForQuality('high')))
      .toBe('/Warpkeep/models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb');
    expect(resolveIntegrityPinnedRealmAssetUrl(
      '/Warpkeep/',
      keepAssetPathForQuality('high'),
      ASSETS[0].sha256
    )).toBe(
      '/Warpkeep/models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb'
    );
    expect(() => resolveIntegrityPinnedRealmAssetUrl(
      '/',
      keepAssetPathForQuality('high'),
      'not-a-digest'
    )).toThrow(/integrity coordinate/i);
    expect(() => resolveIntegrityPinnedRealmAssetUrl(
      '/',
      keepAssetPathForQuality('high'),
      `0${ASSETS[0].sha256.slice(1)}`
    )).toThrow(/not content-addressed/i);
  });

  it('normalizes the source footprint to 74 percent of one hex diameter', () => {
    const normalization = calculateKeepNormalization({
      minX: -6.41045,
      minY: 0,
      minZ: -4.93809,
      maxX: 6.41045,
      maxY: 14.062,
      maxZ: 4.92809
    });

    expect(normalization.scale).toBeCloseTo(0.11544, 4);
    expect(normalization.footprintDiameter).toBeCloseTo(1.48, 6);
    expect(normalization.visualHeight).toBeGreaterThan(1.6);
    expect(normalization.offsetY).toBeCloseTo(0, 8);
    expect(Object.values(normalization).every(Number.isFinite)).toBe(true);
  });

  it('uses the shared production preparation contract for normalized visual roots', () => {
    const scene = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      metalness: 1,
      roughness: 0.05
    });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2), material));

    const prepared = prepareHegemonyKeepScene(scene, {
      dynamicShadows: true,
      maxAnisotropy: 4
    });

    expect(prepared.root.name).toBe('hegemony-main-castle');
    expect(prepared.root.children).toEqual([scene]);
    expect(prepared.footprintDiameter).toBeCloseTo(1.48, 8);
    expect(prepared.visualHeight).toBeCloseTo(0.74, 8);
    expect(scene.scale.x).toBeCloseTo(0.37, 8);
    expect(scene.scale.y).toBeCloseTo(0.37, 8);
    expect(scene.scale.z).toBeCloseTo(0.37, 8);
    expect(scene.position.x).toBeCloseTo(0, 8);
    expect(scene.position.y).toBeCloseTo(0.37, 8);
    expect(scene.position.z).toBeCloseTo(0, 8);
    expect(scene.rotation.y).toBe(0);
    expect((scene.children[0] as THREE.Mesh).castShadow).toBe(true);
    expect((scene.children[0] as THREE.Mesh).receiveShadow).toBe(true);
    expect(material.metalness).toBe(0.92);
    expect(material.roughness).toBe(0.2);
    expect(material.color.r).toBeCloseTo(
      HEGEMONY_MODEL_MATERIAL_CALIBRATION.castleDiffuseGain,
      8
    );
    expect(material.color.g).toBeCloseTo(
      HEGEMONY_MODEL_MATERIAL_CALIBRATION.castleDiffuseGain,
      8
    );
    expect(material.color.b).toBeCloseTo(
      HEGEMONY_MODEL_MATERIAL_CALIBRATION.castleDiffuseGain,
      8
    );

    disposeRealmObject(prepared.root);
  });

  it('applies a bounded role-aware diffuse calibration without compounding it', () => {
    expect(HEGEMONY_MODEL_MATERIAL_CALIBRATION).toEqual({
      revision: 'sunlit-lowlands-v3',
      maximumColorChannel: 1.25,
      castleDiffuseGain: 1.22,
      landscapeBaseDiffuseGain: 1.1
    });
    const material = new THREE.MeshStandardMaterial();
    material.color.setRGB(0.8, 0.6, 1.2);

    tuneHegemonyModelMaterial(material, 1, 'castle');
    const castleColor = material.color.clone();
    tuneHegemonyModelMaterial(material, 8, 'castle');

    expect(material.color.equals(castleColor)).toBe(true);
    expect(material.color.r).toBeCloseTo(
      0.8 * HEGEMONY_MODEL_MATERIAL_CALIBRATION.castleDiffuseGain,
      8
    );
    expect(material.color.g).toBeCloseTo(
      0.6 * HEGEMONY_MODEL_MATERIAL_CALIBRATION.castleDiffuseGain,
      8
    );
    expect(material.color.b).toBe(HEGEMONY_MODEL_MATERIAL_CALIBRATION.maximumColorChannel);
    expect(material.emissiveMap).toBeNull();
    expect(material.emissive.getHex()).toBe(0);

    tuneHegemonyModelMaterial(material, 1, 'landscape-base');

    expect(material.color.r).toBeCloseTo(
      0.8 * HEGEMONY_MODEL_MATERIAL_CALIBRATION.landscapeBaseDiffuseGain,
      8
    );
    expect(material.color.g).toBeCloseTo(
      0.6 * HEGEMONY_MODEL_MATERIAL_CALIBRATION.landscapeBaseDiffuseGain,
      8
    );
    expect(material.color.b).toBe(HEGEMONY_MODEL_MATERIAL_CALIBRATION.maximumColorChannel);
    expect(material.color.r).not.toBeCloseTo(castleColor.r, 8);

    material.dispose();
  });

  it('integrity-checks and coalesces keep bytes while parsing disposable scene instances', async () => {
    const compact = ASSETS[2];
    const source = readFileSync(resolve(ROOT, compact.path));
    const bytes = source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength
    ) as ArrayBuffer;
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit
    ) => new Response(bytes.slice(0), {
      status: 200,
      headers: { 'content-length': String(bytes.byteLength) }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const parsedMaterials: THREE.MeshStandardMaterial[] = [];
    const parser = vi.fn(async () => {
      const scene = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({
        metalness: 0.74,
        roughness: 0.31,
        emissive: '#6d3594',
        emissiveIntensity: 0.8
      });
      material.emissiveMap = new THREE.Texture();
      material.envMapIntensity = 0.95;
      parsedMaterials.push(material);
      scene.add(new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.5, 1),
        material
      ));
      return scene;
    });

    const options = {
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 4,
      parser
    } as const;
    const [first, second] = await Promise.all([
      loadHegemonyKeep(options),
      loadHegemonyKeep(options)
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'same-origin',
      redirect: 'error'
    });
    expect(parser).toHaveBeenCalledTimes(2);
    parsedMaterials.forEach((material) => {
      expect(material.metalness).toBe(0.74);
      expect(material.roughness).toBe(0.31);
      expect(material.envMapIntensity).toBe(0.95);
      expect(material.emissiveIntensity).toBe(0.8);
    });
    expect(first.root).not.toBe(second.root);
    expect(first.assetUrl).toBe(
      '/models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb'
    );
    disposeRealmObject(first.root);
    disposeRealmObject(second.root);
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
    const first = loadHegemonyKeep({ ...options, signal: firstController.signal });
    const second = loadHegemonyKeep({ ...options, signal: secondController.signal });
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
    const long = loadHegemonyKeep({
      ...options,
      signal: longController.signal,
      requestTimeoutMs: 1_000
    });
    const short = loadHegemonyKeep({ ...options, requestTimeoutMs: 25 });
    const longRejection = expect(long).rejects.toMatchObject({ name: 'AbortError' });
    const shortRejection = expect(short).rejects.toThrow(/timed out after 25ms/i);

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(25);
    await shortRejection;
    expect(requestSignals).toHaveLength(2);
    expect(requestSignals[0]?.aborted).toBe(false);
    expect(requestSignals[1]?.aborted).toBe(true);

    longController.abort();
    await longRejection;
    expect(requestSignals[0]?.aborted).toBe(true);
  });

  it('evicts a failed keep request so a later scene can retry cleanly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array(8), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const options = {
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      parser: vi.fn(async () => new THREE.Group())
    } as const;

    await expect(loadHegemonyKeep(options)).rejects.toThrow(/exact byte budget/i);
    await expect(loadHegemonyKeep(options)).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an oversized streaming body before buffering beyond the asset budget', async () => {
    const compact = ASSETS[2];
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(compact.bytes));
        controller.enqueue(new Uint8Array(1));
      },
      cancel() {
        cancelled = true;
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));

    await expect(loadHegemonyKeep({
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      parser: vi.fn(async () => new THREE.Group())
    })).rejects.toThrow(/exceeds its exact byte budget/i);
    expect(cancelled).toBe(true);
  });

  it('bounds a stalled model request and aborts the underlying fetch', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);

    const load = loadHegemonyKeep({
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      requestTimeoutMs: 25,
      parser: vi.fn(async () => new THREE.Group())
    });
    const rejection = expect(load).rejects.toThrow(/timed out after 25ms/i);

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(true);
  });

  it('closes a decoded ImageBitmap once when disposing an unleased parsed object', () => {
    class SyntheticImageBitmap {
      readonly width = 64;
      readonly height = 64;
      readonly close = vi.fn();
    }
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    const bitmap = new SyntheticImageBitmap();
    const firstTexture = new THREE.Texture();
    const secondTexture = new THREE.Texture();
    firstTexture.source.data = bitmap;
    secondTexture.source.data = bitmap;
    const material = new THREE.MeshStandardMaterial({
      map: firstTexture,
      normalMap: secondTexture
    });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

    disposeRealmObject(root);

    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('continues disposing every unique resource when an earlier texture throws', () => {
    class SyntheticImageBitmap {
      readonly width = 64;
      readonly height = 64;
      readonly close = vi.fn();
    }
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    const firstBitmap = new SyntheticImageBitmap();
    const secondBitmap = new SyntheticImageBitmap();
    const firstTexture = new THREE.Texture();
    const secondTexture = new THREE.Texture();
    firstTexture.source.data = firstBitmap;
    secondTexture.source.data = secondBitmap;
    const firstDispose = vi.spyOn(firstTexture, 'dispose').mockImplementation(() => {
      throw new Error('synthetic texture disposal failure');
    });
    const secondDispose = vi.spyOn(secondTexture, 'dispose');
    const material = new THREE.MeshStandardMaterial({
      map: firstTexture,
      normalMap: secondTexture
    });
    const materialDispose = vi.spyOn(material, 'dispose');
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));

    expect(() => disposeRealmObject(root)).toThrow(/texture disposal failure/i);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(firstBitmap.close).toHaveBeenCalledOnce();
    expect(secondBitmap.close).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
