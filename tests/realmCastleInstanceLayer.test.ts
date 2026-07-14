import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createRealmCastleInstanceLayer,
  type RealmCastleInstanceRecord
} from '../src/components/realm/realmCastleInstanceLayer';
import type {
  CastleLod,
  CastleLodPolicy
} from '../src/components/realm/castleInstancePlanning';
import type { HegemonyKeepPrefab } from '../src/components/realm/hegemonyKeepPrefabRepository';

const COMPACT_ONLY_POLICY: CastleLodPolicy = {
  highEnterPixels: 96,
  highExitPixels: 76,
  balancedEnterPixels: 36,
  balancedExitPixels: 28,
  maximumLod: 'compact',
  selectedMinimumLod: 'compact',
  highInstanceBudget: 0,
  balancedInstanceBudget: 0
};

function prefab(
  lod: CastleLod,
  geometry: THREE.BufferGeometry,
  material: THREE.Material
): HegemonyKeepPrefab {
  return {
    lod,
    assetUrl: `/castle-${lod}.glb`,
    footprintDiameter: 1,
    visualHeight: 1,
    primitives: [{
      geometry,
      materials: [material],
      localMatrixElements: new THREE.Matrix4().makeTranslation(0, 0.5, 0).elements,
      sourceMeshName: `castle-${lod}`
    }]
  };
}

function castle(castleId: number, x: number, z: number): RealmCastleInstanceRecord {
  return {
    castleId,
    coord: { q: castleId, r: -castleId },
    x,
    groundY: 0,
    z
  };
}

function camera() {
  const result = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  result.position.set(0, 10, 10);
  result.lookAt(0, 0, 0);
  result.updateProjectionMatrix();
  result.updateMatrixWorld();
  return result;
}

describe('realm castle instance layer', () => {
  it('keeps all 100 visible castles on shared real prefab resources', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const instanceDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    const castles = Array.from({ length: 100 }, (_, index) => {
      const x = (index % 10) * 0.22 - 0.99;
      const z = Math.floor(index / 10) * 0.22 - 0.99;
      return castle(100 - index, x, z);
    });
    const layer = createRealmCastleInstanceLayer({
      castles,
      prefabs: new Map([['compact', prefab('compact', geometry, material)]]),
      policy: COMPACT_ONLY_POLICY,
      dynamicShadows: false
    });

    layer.update(camera(), 900);

    const packing = layer.getPacking();
    const mesh = layer.group.children[0] as THREE.InstancedMesh;
    const shadows = layer.group.getObjectByName(
      'hegemony-castle-contact-shadows'
    ) as THREE.InstancedMesh;
    expect(packing.totalVisible).toBe(100);
    expect(packing.buckets.compact).toHaveLength(100);
    expect(packing.resolveCastleId('compact', 0)).toBe(1);
    expect(packing.resolveCastleId('compact', 99)).toBe(100);
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
    expect(mesh.count).toBe(100);
    expect(shadows).toBeInstanceOf(THREE.InstancedMesh);
    expect(shadows.count).toBe(100);
    const shadowMatrix = new THREE.Matrix4();
    const shadowScale = new THREE.Vector3();
    shadows.getMatrixAt(0, shadowMatrix);
    shadowMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), shadowScale);
    expect(shadowScale.x).toBeCloseTo(0.466);
    expect(shadowScale.y).toBeCloseTo(0.466);

    layer.clear();
    layer.clear();
    layer.dispose();
    layer.dispose();
    // One castle bucket and one contact-shadow mesh release only their
    // layer-owned instance buffers; prefab resources remain repository-owned.
    expect(instanceDispose).toHaveBeenCalledTimes(2);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('keeps selected LOD mapping deterministic for castle raycasts', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const prefabs = new Map<CastleLod, HegemonyKeepPrefab>([
      ['compact', prefab('compact', geometry, material)],
      ['balanced', prefab('balanced', geometry, material)],
      ['high', prefab('high', geometry, material)]
    ]);
    const policy: CastleLodPolicy = {
      ...COMPACT_ONLY_POLICY,
      maximumLod: 'high',
      selectedMinimumLod: 'high',
      highInstanceBudget: 8,
      balancedInstanceBudget: 24,
      balancedEnterPixels: 10_000,
      balancedExitPixels: 9_000,
      highEnterPixels: 12_000,
      highExitPixels: 11_000
    };
    const layer = createRealmCastleInstanceLayer({
      castles: [
        castle(9, 1.5, 0),
        castle(2, 0, 0),
        castle(6, -1.5, 0),
        castle(4, 0, -1.5)
      ],
      prefabs,
      policy,
      dynamicShadows: true
    });
    const sceneCamera = camera();
    layer.update(sceneCamera, 900, 2);

    const packing = layer.getPacking();
    expect(packing.buckets.high.map((entry) => entry.castleId)).toEqual([2]);
    expect(packing.totalVisible).toBe(4);
    expect(packing.buckets.compact.map((entry) => entry.castleId)).toEqual([4, 6, 9]);

    const raycaster = new THREE.Raycaster();
    const target = new THREE.Vector3(0, 0.5, 0);
    raycaster.set(
      sceneCamera.position,
      target.sub(sceneCamera.position).normalize()
    );
    expect(layer.raycast(raycaster)).toEqual({
      castleId: 2,
      coord: { q: 2, r: -2 }
    });
    layer.dispose();
  });
});
