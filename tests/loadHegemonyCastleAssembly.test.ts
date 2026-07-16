import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  assembleHegemonyCastleLandscapeBase,
  loadHegemonyCastleAssembly
} from '../src/components/realm/loadHegemonyCastleAssembly';
import type { HegemonyLandscapeBaseLoadResult } from '../src/components/realm/loadHegemonyLandscapeBase';
import {
  disposeRealmObject,
  type HegemonyKeepLoadResult
} from '../src/components/realm/loadHegemonyKeep';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

function keepResult(scale = 0.12) {
  const root = new THREE.Group();
  const castleTransform = new THREE.Group();
  castleTransform.position.set(0.1, 0.2, -0.3);
  castleTransform.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
  castleTransform.scale.setScalar(scale);
  castleTransform.add(new THREE.Mesh(
    new THREE.BoxGeometry(4, 7, 3),
    new THREE.MeshStandardMaterial()
  ));
  root.add(castleTransform);
  const result: HegemonyKeepLoadResult = {
    root,
    visualHeight: 1.62,
    footprintDiameter: 1.48,
    assetUrl: '/models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb'
  };
  return { castleTransform, result };
}

function baseResult(): HegemonyLandscapeBaseLoadResult {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(18, 2, 15),
    new THREE.MeshStandardMaterial()
  ));
  return {
    root,
    assetUrl: '/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb'
  };
}

describe('Hegemony castle and authored landscape-base assembly', () => {
  it('attaches the base under the exact castle transform while preserving castle sizing', () => {
    const keep = keepResult();
    const landscapeBase = baseResult();

    const result = assembleHegemonyCastleLandscapeBase(
      keep.result,
      landscapeBase,
      { dynamicShadows: false, maxAnisotropy: 2 }
    );

    expect(result.root).toBe(keep.result.root);
    expect(result.visualHeight).toBe(1.62);
    expect(result.footprintDiameter).toBe(1.48);
    expect(result.assetUrl).toBe(keep.result.assetUrl);
    expect(result.landscapeBaseAssetUrl).toBe(landscapeBase.assetUrl);
    expect(landscapeBase.root.name).toBe('hegemony-castle-landscape-base');
    expect(landscapeBase.root.parent).toBe(keep.result.root);
    expect(landscapeBase.root.position.equals(keep.castleTransform.position)).toBe(true);
    expect(landscapeBase.root.quaternion.equals(keep.castleTransform.quaternion)).toBe(true);
    expect(landscapeBase.root.scale.equals(keep.castleTransform.scale)).toBe(true);
    const baseMesh = landscapeBase.root.children[0] as THREE.Mesh;
    expect(baseMesh.userData.warpkeepPrefabRole).toBe('landscape-base');
    expect(baseMesh.castShadow).toBe(false);
    expect(baseMesh.receiveShadow).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);

    disposeRealmObject(result.root);
  });

  it('starts both loads together and returns only the complete assembly', async () => {
    const keep = keepResult();
    const landscapeBase = baseResult();
    let resolveKeep: ((value: HegemonyKeepLoadResult) => void) | undefined;
    let resolveBase: ((value: HegemonyLandscapeBaseLoadResult) => void) | undefined;
    const keepLoader = vi.fn(() => new Promise<HegemonyKeepLoadResult>((resolve) => {
      resolveKeep = resolve;
    }));
    const landscapeBaseLoader = vi.fn(() => (
      new Promise<HegemonyLandscapeBaseLoadResult>((resolve) => {
        resolveBase = resolve;
      })
    ));
    const controller = new AbortController();

    const loading = loadHegemonyCastleAssembly({
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      signal: controller.signal,
      keepLoader,
      landscapeBaseLoader
    });
    expect(keepLoader).toHaveBeenCalledOnce();
    expect(keepLoader).toHaveBeenCalledWith(controller.signal);
    expect(landscapeBaseLoader).toHaveBeenCalledOnce();
    expect(landscapeBaseLoader).toHaveBeenCalledWith(controller.signal);

    resolveBase?.(landscapeBase);
    await Promise.resolve();
    let settled = false;
    void loading.finally(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveKeep?.(keep.result);

    await expect(loading).resolves.toMatchObject({
      root: keep.result.root,
      landscapeBaseAssetUrl: landscapeBase.assetUrl
    });
    disposeRealmObject(keep.result.root);
  });

  it('disposes a fulfilled base when the castle load fails', async () => {
    const failure = new Error('synthetic castle failure');
    const landscapeBase = baseResult();
    const baseMesh = landscapeBase.root.children[0] as THREE.Mesh;
    const geometryDispose = vi.spyOn(baseMesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(baseMesh.material as THREE.Material, 'dispose');

    await expect(loadHegemonyCastleAssembly({
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      keepLoader: vi.fn(async () => { throw failure; }),
      landscapeBaseLoader: vi.fn(async () => landscapeBase)
    })).rejects.toBe(failure);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('disposes a fulfilled castle when the landscape-base load fails', async () => {
    const failure = new Error('synthetic landscape-base failure');
    const keep = keepResult();
    const castleMesh = keep.castleTransform.children[0] as THREE.Mesh;
    const geometryDispose = vi.spyOn(castleMesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(castleMesh.material as THREE.Material, 'dispose');

    await expect(loadHegemonyCastleAssembly({
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      keepLoader: vi.fn(async () => keep.result),
      landscapeBaseLoader: vi.fn(async () => { throw failure; })
    })).rejects.toBe(failure);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('cleans both roots exactly once when the shared-transform contract is invalid', async () => {
    const keep = keepResult();
    keep.castleTransform.scale.set(1, 2, 1);
    const landscapeBase = baseResult();
    const castleMesh = keep.castleTransform.children[0] as THREE.Mesh;
    const baseMesh = landscapeBase.root.children[0] as THREE.Mesh;
    const castleGeometryDispose = vi.spyOn(castleMesh.geometry, 'dispose');
    const castleMaterialDispose = vi.spyOn(castleMesh.material as THREE.Material, 'dispose');
    const baseGeometryDispose = vi.spyOn(baseMesh.geometry, 'dispose');
    const baseMaterialDispose = vi.spyOn(baseMesh.material as THREE.Material, 'dispose');

    await expect(loadHegemonyCastleAssembly({
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      keepLoader: vi.fn(async () => keep.result),
      landscapeBaseLoader: vi.fn(async () => landscapeBase)
    })).rejects.toThrow(/finite uniform transform/i);

    expect(castleGeometryDispose).toHaveBeenCalledOnce();
    expect(castleMaterialDispose).toHaveBeenCalledOnce();
    expect(baseGeometryDispose).toHaveBeenCalledOnce();
    expect(baseMaterialDispose).toHaveBeenCalledOnce();
  });

  it('keeps the castle failure primary when both independent loads reject', async () => {
    const castleFailure = new Error('castle failed first');
    const baseFailure = new Error('base failed too');
    await expect(loadHegemonyCastleAssembly({
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      maxAnisotropy: 1,
      keepLoader: vi.fn(async () => { throw castleFailure; }),
      landscapeBaseLoader: vi.fn(async () => { throw baseFailure; })
    })).rejects.toBe(castleFailure);
  });
});
