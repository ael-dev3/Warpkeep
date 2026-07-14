import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createHegemonyKeepPrefabRepository,
  type HegemonyKeepPrefabLoader
} from '../src/components/realm/hegemonyKeepPrefabRepository';

function loadedKeep(root: THREE.Group, suffix: string) {
  return {
    root,
    visualHeight: 1.056,
    footprintDiameter: 1.48,
    assetUrl: `/models/hegemony/hegemony-frontier-keep-${suffix}.glb`
  };
}

describe('Hegemony keep prefab repository', () => {
  it('coalesces concurrent load/parse and disposes shared resources on only the final lease', async () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const root = new THREE.Group();
    const firstMesh = new THREE.Mesh(geometry, material);
    const secondMesh = new THREE.Mesh(geometry, material);
    secondMesh.position.x = 2;
    root.add(firstMesh, secondMesh);
    const fetchAsset = vi.fn(async () => new ArrayBuffer(8));
    const parseAsset = vi.fn(async () => loadedKeep(root, 'balanced'));
    const loader: HegemonyKeepPrefabLoader = vi.fn(async () => {
      await fetchAsset();
      return parseAsset();
    });
    const repository = createHegemonyKeepPrefabRepository({ loader });

    const [first, second] = await Promise.all([
      repository.acquire('balanced'),
      repository.acquire('balanced')
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(parseAsset).toHaveBeenCalledTimes(1);
    expect(first.prefab).toBe(second.prefab);
    expect(first.prefab.primitives).toHaveLength(2);
    expect(first.prefab.primitives[0].geometry).toBe(geometry);
    expect(first.prefab.primitives[0].materials[0]).toBe(material);
    expect(Object.isFrozen(first.prefab)).toBe(true);
    expect(Object.isFrozen(first.prefab.primitives)).toBe(true);
    expect(Object.isFrozen(first.prefab.primitives[0].localMatrixElements)).toBe(true);

    first.release();
    first.release();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();

    second.release();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    await expect(repository.acquire('balanced')).rejects.toThrow(/retired/i);
  });

  it('reference-counts resources shared by separate LOD prefabs', async () => {
    const sharedTexture = new THREE.Texture();
    const sharedMaterial = new THREE.MeshStandardMaterial({ map: sharedTexture });
    const highGeometry = new THREE.BoxGeometry(1, 1, 1);
    const balancedGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const highGeometryDispose = vi.spyOn(highGeometry, 'dispose');
    const balancedGeometryDispose = vi.spyOn(balancedGeometry, 'dispose');
    const materialDispose = vi.spyOn(sharedMaterial, 'dispose');
    const textureDispose = vi.spyOn(sharedTexture, 'dispose');
    const highRoot = new THREE.Group();
    const balancedRoot = new THREE.Group();
    highRoot.add(new THREE.Mesh(highGeometry, sharedMaterial));
    balancedRoot.add(new THREE.Mesh(balancedGeometry, sharedMaterial));
    const loader: HegemonyKeepPrefabLoader = vi.fn(async (lod) => (
      lod === 'high'
        ? loadedKeep(highRoot, 'high')
        : loadedKeep(balancedRoot, lod)
    ));
    const repository = createHegemonyKeepPrefabRepository({ loader });
    const [high, balanced] = await Promise.all([
      repository.acquire('high'),
      repository.acquire('balanced')
    ]);

    high.release();
    expect(highGeometryDispose).toHaveBeenCalledTimes(1);
    expect(balancedGeometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();

    balanced.release();
    expect(balancedGeometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('deduplicates the integrity-pinned High/Balanced 2K texture set across LODs', async () => {
    const makeMaterial = () => {
      const textures = Array.from({ length: 4 }, () => new THREE.Texture());
      const material = new THREE.MeshStandardMaterial({
        map: textures[0],
        emissiveMap: textures[1],
        normalMap: textures[2],
        metalnessMap: textures[3],
        roughnessMap: textures[3]
      });
      return { material, textures };
    };
    const high = makeMaterial();
    const balanced = makeMaterial();
    const textureDisposals = [...high.textures, ...balanced.textures]
      .map((texture) => vi.spyOn(texture, 'dispose'));
    const highGeometry = new THREE.BoxGeometry(1, 1, 1);
    const balancedGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const highRoot = new THREE.Group();
    const balancedRoot = new THREE.Group();
    highRoot.add(new THREE.Mesh(highGeometry, high.material));
    balancedRoot.add(new THREE.Mesh(balancedGeometry, balanced.material));
    const loader: HegemonyKeepPrefabLoader = vi.fn(async (lod) => (
      lod === 'high'
        ? loadedKeep(highRoot, 'high')
        : loadedKeep(balancedRoot, 'balanced')
    ));
    const repository = createHegemonyKeepPrefabRepository({
      loader,
      shareHighResolutionTextures: true
    });
    const [highLease, balancedLease] = await Promise.all([
      repository.acquire('high'),
      repository.acquire('balanced')
    ]);
    const highMaterial = highLease.prefab.primitives[0].materials[0] as THREE.MeshStandardMaterial;
    const balancedMaterial = balancedLease.prefab.primitives[0].materials[0] as THREE.MeshStandardMaterial;

    expect(balancedMaterial.map).toBe(highMaterial.map);
    expect(balancedMaterial.emissiveMap).toBe(highMaterial.emissiveMap);
    expect(balancedMaterial.normalMap).toBe(highMaterial.normalMap);
    expect(balancedMaterial.metalnessMap).toBe(highMaterial.metalnessMap);
    expect(balancedMaterial.roughnessMap).toBe(highMaterial.roughnessMap);
    expect(textureDisposals.reduce((total, dispose) => total + dispose.mock.calls.length, 0))
      .toBe(4);

    highLease.release();
    expect(textureDisposals.reduce((total, dispose) => total + dispose.mock.calls.length, 0))
      .toBe(4);
    balancedLease.release();
    expect(textureDisposals.reduce((total, dispose) => total + dispose.mock.calls.length, 0))
      .toBe(8);
  });

  it('keeps a failed per-LOD load coalesced and fail-closed for the session', async () => {
    const failure = new Error('synthetic parse failure');
    const loader: HegemonyKeepPrefabLoader = vi.fn(async () => {
      throw failure;
    });
    const repository = createHegemonyKeepPrefabRepository({ loader });
    const first = repository.acquire('compact');
    const second = repository.acquire('compact');

    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    await expect(repository.acquire('compact')).rejects.toBe(failure);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
