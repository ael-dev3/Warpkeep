import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  castleFrustumRadius,
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
  it('uses a conservative three-axis frustum sphere for edge castles', () => {
    expect(castleFrustumRadius(1.48, 1.62)).toBeCloseTo(1.323, 3);
    expect(castleFrustumRadius(-1, -1)).toBe(0);
  });

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

  it('renders and raycasts only castle IDs in the viewport presentation set', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const compactPrefab = prefab('compact', geometry, material);
    const layer = createRealmCastleInstanceLayer({
      castles: [castle(2, -1.5, 0), castle(4, 1.5, 0)],
      prefabs: new Map([['compact', {
        ...compactPrefab,
        primitives: [
          ...compactPrefab.primitives,
          { ...compactPrefab.primitives[0]!, sourceMeshName: 'castle-compact-accent' }
        ]
      }]]),
      policy: COMPACT_ONLY_POLICY,
      dynamicShadows: false
    });
    const sceneCamera = camera();
    layer.setPresentedCastleIds([4, 4]);
    layer.update(sceneCamera, 900);

    expect(layer.getPacking().totalVisible).toBe(1);
    expect(layer.getPacking().buckets.compact.map((entry) => entry.castleId)).toEqual([4]);
    expect(layer.getPresentationTelemetry()).toEqual({
      presentedModelCount: 1,
      raycastTargetCount: 1
    });
    const liveCastleMesh = layer.group.children[0] as THREE.InstancedMesh;
    // Simulate a presentation-mask implementation that updated its plan but
    // left an extra live model instance behind. Telemetry must expose it.
    liveCastleMesh.count = 2;
    expect(layer.getPresentationTelemetry()).toEqual({
      presentedModelCount: 2,
      raycastTargetCount: 1
    });
    liveCastleMesh.count = 1;
    expect((layer.group.children[0] as THREE.InstancedMesh).count).toBe(1);
    expect((layer.group.getObjectByName(
      'hegemony-castle-contact-shadows'
    ) as THREE.InstancedMesh).count).toBe(1);

    const raycaster = new THREE.Raycaster();
    const rayAt = (target: THREE.Vector3) => {
      raycaster.set(
        sceneCamera.position,
        target.sub(sceneCamera.position).normalize()
      );
      return layer.raycast(raycaster);
    };
    expect(rayAt(new THREE.Vector3(-1.5, 0.5, 0))).toBeNull();
    expect(rayAt(new THREE.Vector3(1.5, 0.5, 0))).toEqual({
      castleId: 4,
      coord: { q: 4, r: -4 }
    });

    expect(() => layer.setPresentedCastleIds([999])).toThrow(
      'Invalid presented castle identity set.'
    );
    layer.setPresentedCastleIds(null);
    layer.update(sceneCamera, 900);
    expect(layer.getPacking().totalVisible).toBe(2);
    expect(layer.getPresentationTelemetry()).toEqual({
      presentedModelCount: 2,
      raycastTargetCount: 2
    });
    layer.clear();
    expect(layer.getPresentationTelemetry()).toEqual({
      presentedModelCount: 0,
      raycastTargetCount: 0
    });
    layer.dispose();
  });
});
