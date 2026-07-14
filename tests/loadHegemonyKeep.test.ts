import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  calculateKeepNormalization,
  clearHegemonyKeepBinaryCacheForTests,
  disposeRealmObject,
  keepAssetPathForQuality,
  loadHegemonyKeep,
  resolveRealmAssetUrl
} from '../src/components/realm/loadHegemonyKeep';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

const ROOT = resolve(import.meta.dirname, '..');

const ASSETS = [
  {
    quality: 'high' as const,
    path: 'public/models/hegemony/hegemony-frontier-keep-high.glb',
    bytes: 2_256_092,
    sha256: 'ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c',
    maxBytes: 10_000_000
  },
  {
    quality: 'balanced' as const,
    path: 'public/models/hegemony/hegemony-frontier-keep-balanced.glb',
    bytes: 2_064_100,
    sha256: 'bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4',
    maxBytes: 2_500_000
  },
  {
    quality: 'reduced' as const,
    path: 'public/models/hegemony/hegemony-frontier-keep-compact.glb',
    bytes: 760_916,
    sha256: '9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b',
    maxBytes: 4_000_000
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
      expect(json.images).toHaveLength(4);
    });
  });

  it('selects only one LOD and resolves it under the active Vite base path', () => {
    expect(keepAssetPathForQuality('high')).toContain('-high.glb');
    expect(keepAssetPathForQuality('balanced')).toContain('-balanced.glb');
    expect(keepAssetPathForQuality('reduced')).toContain('-compact.glb');
    expect(resolveRealmAssetUrl('/Warpkeep/', keepAssetPathForQuality('high')))
      .toBe('/Warpkeep/models/hegemony/hegemony-frontier-keep-high.glb');
  });

  it('normalizes the source footprint to 74 percent of one hex diameter', () => {
    const normalization = calculateKeepNormalization({
      minX: -0.94968,
      minY: -0.67927,
      minZ: -0.66523,
      maxX: 0.94756,
      maxY: 0.67433,
      maxZ: 0.6629
    });

    expect(normalization.scale).toBeCloseTo(0.78, 2);
    expect(normalization.footprintDiameter).toBeCloseTo(1.48, 6);
    expect(normalization.visualHeight).toBeGreaterThan(1);
    expect(normalization.offsetY).toBeGreaterThan(0);
    expect(Object.values(normalization).every(Number.isFinite)).toBe(true);
  });

  it('integrity-checks and coalesces keep bytes while parsing disposable scene instances', async () => {
    const compact = ASSETS[2];
    const source = readFileSync(resolve(ROOT, compact.path));
    const bytes = source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength
    ) as ArrayBuffer;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.slice(0)
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
    expect(parser).toHaveBeenCalledTimes(2);
    parsedMaterials.forEach((material) => {
      expect(material.metalness).toBe(0.74);
      expect(material.roughness).toBe(0.31);
      expect(material.envMapIntensity).toBe(0.95);
      expect(material.emissiveIntensity).toBe(0.8);
    });
    expect(first.root).not.toBe(second.root);
    expect(first.assetUrl).toBe('/models/hegemony/hegemony-frontier-keep-compact.glb');
    disposeRealmObject(first.root);
    disposeRealmObject(second.root);
  });

  it('evicts a failed keep request so a later scene can retry cleanly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8)
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        arrayBuffer: async () => new ArrayBuffer(0)
      });
    vi.stubGlobal('fetch', fetchMock);
    const options = {
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      parser: vi.fn(async () => new THREE.Group())
    } as const;

    await expect(loadHegemonyKeep(options)).rejects.toThrow(/integrity check/i);
    await expect(loadHegemonyKeep(options)).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
});
