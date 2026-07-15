import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  CASTLE_GROUND_LIFT,
  castleFrustumRadius,
  createRealmCastleInstanceLayer,
  type RealmCastleInstanceRecord
} from '../src/components/realm/realmCastleInstanceLayer';
import type {
  CastleLod,
  CastleLodPolicy
} from '../src/components/realm/castleInstancePlanning';
import {
  createHegemonyKeepPrefabRepository,
  type HegemonyKeepPrefab
} from '../src/components/realm/hegemonyKeepPrefabRepository';
import {
  clearHegemonyKeepBinaryCacheForTests,
  loadHegemonyKeep
} from '../src/components/realm/loadHegemonyKeep';
import { deriveCastleProjectionEnvelope } from '../src/components/realm/realmCastleProjectionGeometry';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

const ROOT = resolve(import.meta.dirname, '..');

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
  const primitives = [{
    geometry,
    materials: [material],
    localMatrixElements: new THREE.Matrix4().makeTranslation(0, 0.5, 0).elements,
    sourceMeshName: `castle-${lod}`
  }];
  return {
    lod,
    assetUrl: `/castle-${lod}.glb`,
    footprintDiameter: 1,
    visualHeight: 1,
    projectionEnvelope: deriveCastleProjectionEnvelope(primitives)!,
    primitives
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

function exactArrayBuffer(path: string): ArrayBuffer {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * JSDOM has no object-URL implementation, while the production GLTFLoader
 * creates object URLs for the castle's embedded WebP images. The test keeps
 * the model bytes local and substitutes only the browser image decoder; the
 * GLB geometry itself still goes through the real Meshopt GLTF parser.
 */
function installLocalObjectUrlShim() {
  const url = self.URL as typeof URL & {
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (objectUrl: string) => void;
  };
  const originalCreate = Object.getOwnPropertyDescriptor(url, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(url, 'revokeObjectURL');
  Object.defineProperty(url, 'createObjectURL', {
    configurable: true,
    value: () => 'data:application/octet-stream;base64,AA=='
  });
  Object.defineProperty(url, 'revokeObjectURL', {
    configurable: true,
    value: () => undefined
  });
  return () => {
    if (originalCreate) Object.defineProperty(url, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(url, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(url, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(url, 'revokeObjectURL');
  };
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

  it('picks an instantiated castle decoded from the exact compact Meshopt GLB', async () => {
    const bytes = exactArrayBuffer(resolve(
      ROOT,
      'public/models/hegemony/hegemony-main-castle-compact.glb'
    ));
    const restoreObjectUrls = installLocalObjectUrlShim();
    const decodedBitmaps = vi.fn(async () => ({
      width: 1,
      height: 1,
      close: vi.fn()
    }));
    vi.stubGlobal('createImageBitmap', decodedBitmaps);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : input.toString();
      if (url === '/models/hegemony/hegemony-main-castle-compact.glb') {
        return new Response(bytes.slice(0), {
          status: 200,
          headers: { 'content-length': String(bytes.byteLength) }
        });
      }
      // The texture pixels cannot be decoded in JSDOM. Their source still
      // traverses GLTFLoader, which calls the local createImageBitmap shim.
      return new Response(new Uint8Array([0]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    let layer: ReturnType<typeof createRealmCastleInstanceLayer> | undefined;
    let release: (() => void) | undefined;
    try {
      const loaded = await loadHegemonyKeep({
        quality: REALM_QUALITY_SPECS.reduced,
        baseUrl: '/',
        maxAnisotropy: 1
      });
      const repository = createHegemonyKeepPrefabRepository({
        loader: vi.fn(async () => loaded)
      });
      const lease = await repository.acquire('compact');
      release = lease.release;

      const primitive = lease.prefab.primitives[0]!;
      expect(primitive.geometry.getAttribute('position').count).toBe(34_098);
      expect(primitive.geometry.index?.count).toBe(19_086 * 3);
      expect(decodedBitmaps).toHaveBeenCalledTimes(2);

      // Find a real top-facing triangle from the decoded source mesh, then
      // project that exact world point through a pointer-style camera ray.
      // This makes the assertion independent of any guessed model silhouette.
      loaded.root.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(loaded.root);
      const sourceRaycaster = new THREE.Raycaster();
      let sourceHit: THREE.Intersection<THREE.Object3D> | undefined;
      for (const xFraction of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        for (const zFraction of [0.15, 0.35, 0.5, 0.65, 0.85]) {
          sourceRaycaster.set(
            new THREE.Vector3(
              THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, xFraction),
              bounds.max.y + 5,
              THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, zFraction)
            ),
            new THREE.Vector3(0, -1, 0)
          );
          const hit = sourceRaycaster.intersectObject(loaded.root, true)
            .find((candidate) => candidate.object instanceof THREE.Mesh);
          if (hit) {
            sourceHit = hit;
            break;
          }
        }
        if (sourceHit) break;
      }
      expect(sourceHit).toBeDefined();
      if (!sourceHit) throw new Error('Decoded compact castle has no raycastable surface.');

      layer = createRealmCastleInstanceLayer({
        castles: [castle(439, 0, 0)],
        prefabs: new Map([['compact', lease.prefab]]),
        policy: COMPACT_ONLY_POLICY,
        dynamicShadows: false
      });
      const instancePoint = sourceHit.point.clone();
      instancePoint.y += CASTLE_GROUND_LIFT;
      const pickCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      pickCamera.position.copy(instancePoint).add(new THREE.Vector3(0, 5, 0));
      pickCamera.lookAt(instancePoint);
      pickCamera.updateProjectionMatrix();
      pickCamera.updateMatrixWorld();
      layer.update(pickCamera, 900);

      const pointerRaycaster = new THREE.Raycaster();
      pointerRaycaster.setFromCamera(new THREE.Vector2(0, 0), pickCamera);
      expect(layer.raycast(pointerRaycaster)).toEqual({
        castleId: 439,
        coord: { q: 439, r: -439 }
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/models/hegemony/hegemony-main-castle-compact.glb',
        expect.objectContaining({ credentials: 'same-origin', redirect: 'error' })
      );
    } finally {
      layer?.dispose();
      release?.();
      clearHegemonyKeepBinaryCacheForTests();
      vi.unstubAllGlobals();
      restoreObjectUrls();
    }
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
