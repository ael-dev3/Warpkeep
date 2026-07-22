import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createHegemonyKeepPrefabRepository,
  type HegemonyKeepPrefabLoader
} from '../src/components/realm/hegemonyKeepPrefabRepository';

function loadedKeep(root: THREE.Group, suffix: string) {
  return {
    root,
    visualHeight: 1.056,
    footprintDiameter: 1.48,
    assetUrl: `/models/hegemony/hegemony-main-castle-${suffix}.glb`
  };
}

class SyntheticImageBitmap {
  readonly width = 64;
  readonly height = 64;
  readonly close = vi.fn();
}

function textureWithSource(source: unknown) {
  const texture = new THREE.Texture();
  texture.source.data = source;
  return texture;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    expect(first.prefab.projectionEnvelope).toMatchObject({
      mode: 'convex-hull',
      localBounds: {
        minX: -0.5,
        minY: -0.5,
        minZ: -0.5,
        maxX: 2.5,
        maxY: 0.5,
        maxZ: 0.5
      }
    });
    expect(first.prefab.projectionEnvelope.samples.length).toBeLessThanOrEqual(512);
    expect(Object.isFrozen(first.prefab.projectionEnvelope)).toBe(true);
    expect(Object.isFrozen(first.prefab.projectionEnvelope.samples)).toBe(true);
    expect(first.prefab.renderProjectionEnvelope).toBe(
      first.prefab.projectionEnvelope
    );
    expect(first.prefab.landscapeBaseProjectionEnvelope).toBeUndefined();
    expect(first.prefab.landscapeBasePrimitiveCount).toBe(0);

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

  it('keeps a coalesced prefab load alive when only one pending consumer cancels', async () => {
    let resolveLoad: ((value: ReturnType<typeof loadedKeep>) => void) | undefined;
    let repositorySignal: AbortSignal | undefined;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    const loader: HegemonyKeepPrefabLoader = vi.fn((_lod, signal) => {
      repositorySignal = signal;
      return new Promise<ReturnType<typeof loadedKeep>>((resolve) => {
        resolveLoad = resolve;
      });
    });
    const repository = createHegemonyKeepPrefabRepository({ loader });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = repository.acquire('compact', firstController.signal);
    const second = repository.acquire('compact', secondController.signal);
    const firstRejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });

    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    firstController.abort();
    await firstRejection;
    expect(repositorySignal?.aborted).toBe(false);

    resolveLoad?.(loadedKeep(root, 'compact'));
    const secondLease = await second;
    expect(secondLease.prefab.lod).toBe('compact');
    expect(repositorySignal?.aborted).toBe(false);
    secondLease.release();
  });

  it('keeps resolved resources alive while a new lease acquisition is pending', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    const repository = createHegemonyKeepPrefabRepository({
      loader: vi.fn(async () => loadedKeep(root, 'compact'))
    });
    const first = await repository.acquire('compact');

    const pendingSecond = repository.acquire('compact');
    first.release();

    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    const second = await pendingSecond;
    expect(second.prefab).toBe(first.prefab);
    second.release();

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('releases resolved resources once when the final pending handoff cancels', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    const repository = createHegemonyKeepPrefabRepository({
      loader: vi.fn(async () => loadedKeep(root, 'compact'))
    });
    const first = await repository.acquire('compact');
    const controller = new AbortController();

    const pendingSecond = repository.acquire('compact', controller.signal);
    const rejection = expect(pendingSecond).rejects.toMatchObject({ name: 'AbortError' });
    first.release();
    controller.abort();
    await rejection;

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    first.release();
    controller.abort();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('separates castle, landscape-base, and conservative render envelopes', async () => {
    const castleGeometry = new THREE.BoxGeometry(1, 2, 1);
    const baseGeometry = new THREE.BoxGeometry(4, 0.4, 3);
    const castlePosition = castleGeometry.getAttribute('position');
    const basePosition = baseGeometry.getAttribute('position');
    const castlePositionReads = [
      vi.spyOn(castlePosition, 'getX'),
      vi.spyOn(castlePosition, 'getY'),
      vi.spyOn(castlePosition, 'getZ')
    ];
    const basePositionReads = [
      vi.spyOn(basePosition, 'getX'),
      vi.spyOn(basePosition, 'getY'),
      vi.spyOn(basePosition, 'getZ')
    ];
    const castleMesh = new THREE.Mesh(
      castleGeometry,
      new THREE.MeshStandardMaterial()
    );
    castleMesh.name = 'main-castle';
    castleMesh.position.y = 1;
    const baseMesh = new THREE.Mesh(
      baseGeometry,
      new THREE.MeshStandardMaterial()
    );
    baseMesh.name = 'authored-landscape-base';
    baseMesh.userData.warpkeepPrefabRole = 'landscape-base';
    const root = new THREE.Group();
    root.add(castleMesh, baseMesh);
    const repository = createHegemonyKeepPrefabRepository({
      loader: vi.fn(async () => loadedKeep(root, 'compact'))
    });

    const lease = await repository.acquire('compact');

    expect(lease.prefab.primitives.map(({ sourceMeshName, role }) => ({
      sourceMeshName,
      role
    }))).toEqual([
      { sourceMeshName: 'main-castle', role: 'castle' },
      { sourceMeshName: 'authored-landscape-base', role: 'landscape-base' }
    ]);
    expect(lease.prefab.landscapeBasePrimitiveCount).toBe(1);
    expect(lease.prefab.projectionEnvelope.localBounds).toMatchObject({
      minX: -0.5,
      minY: 0,
      minZ: -0.5,
      maxX: 0.5,
      maxY: 2,
      maxZ: 0.5
    });
    const baseBounds = lease.prefab.landscapeBaseProjectionEnvelope!.localBounds;
    expect(baseBounds.minX).toBeCloseTo(-2, 8);
    expect(baseBounds.minY).toBeCloseTo(-0.2, 8);
    expect(baseBounds.minZ).toBeCloseTo(-1.5, 8);
    expect(baseBounds.maxX).toBeCloseTo(2, 8);
    expect(baseBounds.maxY).toBeCloseTo(0.2, 8);
    expect(baseBounds.maxZ).toBeCloseTo(1.5, 8);
    const renderBounds = lease.prefab.renderProjectionEnvelope.localBounds;
    expect(lease.prefab.renderProjectionEnvelope.mode).toBe('axis-aligned-bounds');
    expect(lease.prefab.renderProjectionEnvelope.samples).toHaveLength(8);
    expect(renderBounds.minX).toBeCloseTo(-2, 8);
    expect(renderBounds.minY).toBeCloseTo(-0.2, 8);
    expect(renderBounds.minZ).toBeCloseTo(-1.5, 8);
    expect(renderBounds.maxX).toBeCloseTo(2, 8);
    expect(renderBounds.maxY).toBeCloseTo(2, 8);
    expect(renderBounds.maxZ).toBeCloseTo(1.5, 8);
    for (const enclosedBounds of [
      lease.prefab.projectionEnvelope.localBounds,
      baseBounds
    ]) {
      expect(renderBounds.minX).toBeLessThanOrEqual(enclosedBounds.minX);
      expect(renderBounds.minY).toBeLessThanOrEqual(enclosedBounds.minY);
      expect(renderBounds.minZ).toBeLessThanOrEqual(enclosedBounds.minZ);
      expect(renderBounds.maxX).toBeGreaterThanOrEqual(enclosedBounds.maxX);
      expect(renderBounds.maxY).toBeGreaterThanOrEqual(enclosedBounds.maxY);
      expect(renderBounds.maxZ).toBeGreaterThanOrEqual(enclosedBounds.maxZ);
    }
    castlePositionReads.forEach((read) => {
      expect(read).toHaveBeenCalledTimes(castlePosition.count);
    });
    basePositionReads.forEach((read) => {
      expect(read).toHaveBeenCalledTimes(basePosition.count);
    });

    lease.release();
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

  it('deduplicates compatible High/Balanced texture sets across LODs', async () => {
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    const makeMaterial = () => {
      const bitmapSources = Array.from({ length: 4 }, () => new SyntheticImageBitmap());
      const textures = bitmapSources.map(textureWithSource);
      const material = new THREE.MeshStandardMaterial({
        map: textures[0],
        emissiveMap: textures[1],
        normalMap: textures[2],
        metalnessMap: textures[3],
        roughnessMap: textures[3]
      });
      return { bitmapSources, material, textures };
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
    expect(balanced.bitmapSources.every((source) => source.close.mock.calls.length === 1)).toBe(true);
    expect(high.bitmapSources.every((source) => source.close.mock.calls.length === 0)).toBe(true);

    highLease.release();
    expect(textureDisposals.reduce((total, dispose) => total + dispose.mock.calls.length, 0))
      .toBe(4);
    expect(high.bitmapSources.every((source) => source.close.mock.calls.length === 0)).toBe(true);
    balancedLease.release();
    expect(textureDisposals.reduce((total, dispose) => total + dispose.mock.calls.length, 0))
      .toBe(8);
    expect(high.bitmapSources.every((source) => source.close.mock.calls.length === 1)).toBe(true);
  });

  it('closes one shared ImageBitmap source exactly once on final release', async () => {
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    const bitmap = new SyntheticImageBitmap();
    const map = textureWithSource(bitmap);
    const normalMap = textureWithSource(bitmap);
    const material = new THREE.MeshStandardMaterial({ map, normalMap });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const repository = createHegemonyKeepPrefabRepository({
      loader: vi.fn(async () => loadedKeep(root, 'compact'))
    });

    const lease = await repository.acquire('compact');
    lease.release();
    lease.release();

    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('never structurally closes an HTML-image-like texture source', async () => {
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    const source = { width: 64, height: 64, close: vi.fn() };
    const material = new THREE.MeshStandardMaterial({ map: textureWithSource(source) });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const repository = createHegemonyKeepPrefabRepository({
      loader: vi.fn(async () => loadedKeep(root, 'compact'))
    });

    (await repository.acquire('compact')).release();

    expect(source.close).not.toHaveBeenCalled();
  });

  it('continues closing retained bitmap sources when one close throws', async () => {
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    const first = new SyntheticImageBitmap();
    const second = new SyntheticImageBitmap();
    first.close.mockImplementation(() => { throw new Error('synthetic bitmap close failure'); });
    const material = new THREE.MeshStandardMaterial({
      map: textureWithSource(first),
      normalMap: textureWithSource(second)
    });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const repository = createHegemonyKeepPrefabRepository({
      loader: vi.fn(async () => loadedKeep(root, 'compact'))
    });
    const lease = await repository.acquire('compact');

    expect(() => lease.release()).toThrow(/bitmap close failure/i);
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
  });

  it('disposes an already-loaded root when prefab validation rejects it', async () => {
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    const bitmap = new SyntheticImageBitmap();
    const texture = textureWithSource(bitmap);
    const textureDispose = vi.spyOn(texture, 'dispose');
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const materialDispose = vi.spyOn(material, 'dispose');
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    const invalid = {
      ...loadedKeep(root, 'compact'),
      visualHeight: Number.NaN
    };
    const repository = createHegemonyKeepPrefabRepository({
      loader: vi.fn(async () => invalid)
    });

    await expect(repository.acquire('compact')).rejects.toThrow(/invalid normalized bounds/i);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
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

  it('replaces a settled failed entry only for an explicit coalesced retry', async () => {
    const failure = new Error('transient compact transport failure');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    ));
    const loader: HegemonyKeepPrefabLoader = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(loadedKeep(root, 'compact'));
    const repository = createHegemonyKeepPrefabRepository({ loader });

    await expect(repository.acquire('compact')).rejects.toBe(failure);
    const [first, second] = await Promise.all([
      repository.retryFailed('compact'),
      repository.retryFailed('compact')
    ]);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(first.prefab).toBe(second.prefab);
    first.release();
    second.release();
  });
});
