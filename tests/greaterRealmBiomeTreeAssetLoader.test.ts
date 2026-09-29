import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { parseAsyncMock } = vi.hoisted(() => ({ parseAsyncMock: vi.fn() }));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parseAsync = parseAsyncMock;
  }
}));

import { GREATER_REALM_BIOME_TREE_V3 } from '../src/greater-realm/biomeTreeV3Catalog';
import {
  loadGreaterRealmBiomeTreePrototype,
  resolveGreaterRealmBiomeTreeAssetPath
} from '../src/greater-realm/loadGreaterRealmBiomeTreeAssets';

function digestBuffer(hex: string) {
  const bytes = Uint8Array.from(hex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
  return bytes.buffer;
}

describe('Greater Realm v3 tree asset loader', () => {
  beforeEach(() => {
    parseAsyncMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves public model paths under the configured deployment base', () => {
    const path = '/models/greater-realm/biome-trees/v3/broad-oak-mobile.glb';
    expect(resolveGreaterRealmBiomeTreeAssetPath(path, '/ptr/')).toBe(`/ptr${path}`);
    expect(resolveGreaterRealmBiomeTreeAssetPath(path, '/')).toBe(path);
    expect(resolveGreaterRealmBiomeTreeAssetPath(path, './')).toBe(`.${path}`);
  });

  it('retries a rejected request after a temporary network failure', async () => {
    const asset = GREATER_REALM_BIOME_TREE_V3[1].mobile;
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('network temporarily unavailable'))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(asset.bytes))
      } as unknown as Response);
    const digest = vi.fn().mockResolvedValue(digestBuffer(asset.sha256));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { subtle: { digest } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    parseAsyncMock.mockResolvedValue({ scene });

    await expect(loadGreaterRealmBiomeTreePrototype(1, 'balanced'))
      .rejects.toThrow('network temporarily unavailable');
    const prototype = await loadGreaterRealmBiomeTreePrototype(1, 'balanced');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/models/greater-realm/biome-trees/v3/lowland-orchard-mobile.glb'
    );
    expect(parseAsyncMock).toHaveBeenCalledOnce();
    expect(prototype.scale).toBeGreaterThan(0);
    expect(console.warn).toHaveBeenCalledOnce();

    prototype.geometry.dispose();
    prototype.material.map?.dispose();
    prototype.material.dispose();
  });
});
