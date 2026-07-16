import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CastleLod, CastleLodPolicy } from '../src/components/realm/castleInstancePlanning';
import {
  createHegemonyKeepPrefabRepository,
  type HegemonyKeepPrefab,
  type HegemonyKeepPrefabLease
} from '../src/components/realm/hegemonyKeepPrefabRepository';
import { loadHegemonyCastleAssembly } from '../src/components/realm/loadHegemonyCastleAssembly';
import {
  clearHegemonyKeepBinaryCacheForTests,
  disposeRealmObject,
  type HegemonyKeepLoadResult
} from '../src/components/realm/loadHegemonyKeep';
import { clearHegemonyLandscapeBaseBinaryCacheForTests } from '../src/components/realm/loadHegemonyLandscapeBase';
import {
  CASTLE_GROUND_LIFT,
  createRealmCastleInstanceLayer,
  type RealmCastleInstanceLayer
} from '../src/components/realm/realmCastleInstanceLayer';
import { REALM_QUALITY_SPECS, type RealmQuality } from '../src/components/realm/realmQuality';

const ROOT = resolve(import.meta.dirname, '..');

const ASSEMBLIES = [
  {
    quality: 'high' as const,
    lod: 'high' as const,
    castlePath: 'models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb',
    castlePositions: 171_554,
    castleIndices: 218_550,
    basePath: 'models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb',
    basePositions: 10_681,
    baseIndices: 11_862
  },
  {
    quality: 'balanced' as const,
    lod: 'balanced' as const,
    castlePath: 'models/hegemony/hegemony-main-castle-balanced-a9df1a9acd36e720.glb',
    castlePositions: 67_687,
    castleIndices: 97_650,
    basePath: 'models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb',
    basePositions: 5_611,
    baseIndices: 6_414
  },
  {
    quality: 'reduced' as const,
    lod: 'compact' as const,
    castlePath: 'models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb',
    castlePositions: 34_800,
    castleIndices: 51_696,
    basePath: 'models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb',
    basePositions: 1_780,
    baseIndices: 2_142
  }
] as const;

const COMPACT_ONLY_POLICY: CastleLodPolicy = Object.freeze({
  highEnterPixels: 96,
  highExitPixels: 76,
  balancedEnterPixels: 36,
  balancedExitPixels: 28,
  maximumLod: 'compact',
  selectedMinimumLod: 'compact',
  highInstanceBudget: 0,
  balancedInstanceBudget: 0
});

class SyntheticImageBitmap {
  readonly width = 1;
  readonly height = 1;
  readonly close = vi.fn();
}

function exactArrayBuffer(path: string): ArrayBuffer {
  const bytes = readFileSync(resolve(ROOT, 'public', path));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * JSDOM cannot decode WebP or create object URLs. GLTFLoader still extracts
 * each real embedded WebP into a correctly typed Blob; only the platform image
 * decoder is replaced. Meshopt geometry always comes from the exact GLB bytes.
 */
function installLocalImageDecoder() {
  const url = self.URL as typeof URL & {
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (objectUrl: string) => void;
  };
  const originalCreate = Object.getOwnPropertyDescriptor(url, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(url, 'revokeObjectURL');
  const embeddedImages = new Map<string, Blob>();
  let nextObjectUrl = 0;
  const createObjectURL = vi.fn((blob: Blob) => {
    const objectUrl = `blob:warpkeep-production-parser/${nextObjectUrl}`;
    nextObjectUrl += 1;
    embeddedImages.set(objectUrl, blob);
    return objectUrl;
  });
  const revokeObjectURL = vi.fn((objectUrl: string) => {
    embeddedImages.delete(objectUrl);
  });
  Object.defineProperty(url, 'createObjectURL', {
    configurable: true,
    value: createObjectURL
  });
  Object.defineProperty(url, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL
  });
  return {
    createObjectURL,
    embeddedImages,
    revokeObjectURL,
    restore: () => {
      if (originalCreate) Object.defineProperty(url, 'createObjectURL', originalCreate);
      else Reflect.deleteProperty(url, 'createObjectURL');
      if (originalRevoke) Object.defineProperty(url, 'revokeObjectURL', originalRevoke);
      else Reflect.deleteProperty(url, 'revokeObjectURL');
    }
  };
}

function meshesIn(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function texturesIn(materials: Iterable<THREE.Material>) {
  const textures = new Set<THREE.Texture>();
  for (const material of materials) {
    Object.values(material).forEach((value) => {
      if (value instanceof THREE.Texture) textures.add(value);
      if (Array.isArray(value)) {
        value.forEach((candidate) => {
          if (candidate instanceof THREE.Texture) textures.add(candidate);
        });
      }
    });
  }
  return textures;
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 8, 8);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

function outsideCastlePoint(prefab: HegemonyKeepPrefab) {
  const castle = prefab.projectionEnvelope.localBounds;
  const base = prefab.landscapeBaseProjectionEnvelope?.localBounds;
  if (!base) throw new Error('Production prefab is missing its landscape-base envelope.');
  const positiveExtension = base.maxX - castle.maxX;
  const negativeExtension = castle.minX - base.minX;
  if (Math.max(positiveExtension, negativeExtension) <= 0.05) {
    throw new Error('Production landscape base does not extend beyond the castle.');
  }
  return new THREE.Vector3(
    positiveExtension >= negativeExtension
      ? THREE.MathUtils.lerp(castle.maxX, base.maxX, 0.55)
      : THREE.MathUtils.lerp(castle.minX, base.minX, 0.55),
    base.maxY + CASTLE_GROUND_LIFT + 4,
    (base.minZ + base.maxZ) * 0.5
  );
}

afterEach(() => {
  clearHegemonyKeepBinaryCacheForTests();
  clearHegemonyLandscapeBaseBinaryCacheForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('production Hegemony castle and landscape-base assemblies', () => {
  it('parses every exact Meshopt/WebP pair and preserves picking and lifetime contracts', async () => {
    const imageDecoder = installLocalImageDecoder();
    const decodedBitmaps: SyntheticImageBitmap[] = [];
    vi.stubGlobal('ImageBitmap', SyntheticImageBitmap);
    const createImageBitmap = vi.fn(async () => {
      const bitmap = new SyntheticImageBitmap();
      decodedBitmaps.push(bitmap);
      return bitmap;
    });
    vi.stubGlobal('createImageBitmap', createImageBitmap);

    const binaries = new Map<string, ArrayBuffer>();
    ASSEMBLIES.forEach((assembly) => {
      binaries.set(`/${assembly.castlePath}`, exactArrayBuffer(assembly.castlePath));
      binaries.set(`/${assembly.basePath}`, exactArrayBuffer(assembly.basePath));
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const binary = binaries.get(url);
      if (binary) {
        return new Response(binary.slice(0), {
          status: 200,
          headers: { 'content-length': String(binary.byteLength) }
        });
      }
      if (imageDecoder.embeddedImages.has(url)) {
        return new Response(new Uint8Array([0]), {
          status: 200,
          headers: { 'content-type': 'image/webp' }
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const loadedByLod = new Map<CastleLod, HegemonyKeepLoadResult>();
    const loadedRoots: THREE.Object3D[] = [];
    const leases: HegemonyKeepPrefabLease[] = [];
    let layer: RealmCastleInstanceLayer | undefined;
    let resourcesTransferredToRepository = false;
    try {
      for (const expected of ASSEMBLIES) {
        const quality = REALM_QUALITY_SPECS[expected.quality satisfies RealmQuality];
        const loaded = await loadHegemonyCastleAssembly({
          quality,
          baseUrl: '/',
          maxAnisotropy: 4
        });
        loadedRoots.push(loaded.root);
        loadedByLod.set(expected.lod, loaded);

        expect(loaded.assetUrl).toBe(`/${expected.castlePath}`);
        expect(loaded.landscapeBaseAssetUrl).toBe(`/${expected.basePath}`);
        expect(loaded.footprintDiameter).toBeCloseTo(1.48, 8);
        expect(loaded.visualHeight).toBeGreaterThan(1);

        const castleTransform = loaded.root.children[0]!;
        const baseRoot = loaded.root.getObjectByName('hegemony-castle-landscape-base')!;
        expect(baseRoot.parent).toBe(loaded.root);
        expect(baseRoot.position.equals(castleTransform.position)).toBe(true);
        expect(baseRoot.quaternion.equals(castleTransform.quaternion)).toBe(true);
        expect(baseRoot.scale.equals(castleTransform.scale)).toBe(true);
        expect(castleTransform.scale.x).toBeGreaterThan(0);
        expect(castleTransform.scale.x).toBeCloseTo(castleTransform.scale.y, 12);
        expect(castleTransform.scale.x).toBeCloseTo(castleTransform.scale.z, 12);

        const allMeshes = meshesIn(loaded.root);
        const castleMeshes = allMeshes.filter((mesh) => (
          mesh.userData.warpkeepPrefabRole !== 'landscape-base'
        ));
        const baseMeshes = allMeshes.filter((mesh) => (
          mesh.userData.warpkeepPrefabRole === 'landscape-base'
        ));
        expect(castleMeshes).toHaveLength(1);
        expect(baseMeshes).toHaveLength(1);
        const castleMesh = castleMeshes[0]!;
        const baseMesh = baseMeshes[0]!;
        expect(castleMesh.geometry.getAttribute('position').count)
          .toBe(expected.castlePositions);
        expect(castleMesh.geometry.index?.count).toBe(expected.castleIndices);
        expect(baseMesh.geometry.getAttribute('position').count).toBe(expected.basePositions);
        expect(baseMesh.geometry.index?.count).toBe(expected.baseIndices);
        expect(castleMesh.geometry.getAttribute('normal').count)
          .toBe(expected.castlePositions);
        expect(baseMesh.geometry.getAttribute('normal').count).toBe(expected.basePositions);
        expect(castleMesh.castShadow).toBe(quality.dynamicShadows);
        expect(baseMesh.castShadow).toBe(quality.dynamicShadows);
        expect(castleMesh.receiveShadow).toBe(true);
        expect(baseMesh.receiveShadow).toBe(true);

        const castleMaterial = castleMesh.material as THREE.MeshStandardMaterial;
        const baseMaterial = baseMesh.material as THREE.MeshStandardMaterial;
        for (const material of [castleMaterial, baseMaterial]) {
          expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
          expect(material.map?.source.data).toBeInstanceOf(SyntheticImageBitmap);
          expect(material.normalMap?.source.data).toBeInstanceOf(SyntheticImageBitmap);
          expect(material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
          expect(material.map?.anisotropy).toBe(4);
          expect(material.normalMap?.anisotropy).toBe(4);
          expect(material.version).toBeGreaterThan(0);
        }
        expect(castleMaterial.metalness).toBeCloseTo(0.08, 6);
        expect(castleMaterial.roughness).toBeCloseTo(0.68, 6);
        expect(baseMaterial.metalness).toBe(0);
        expect(baseMaterial.roughness).toBeCloseTo(0.86, 6);

        loaded.root.updateWorldMatrix(true, true);
        const castleBounds = new THREE.Box3().setFromObject(castleTransform);
        const baseBounds = new THREE.Box3().setFromObject(baseRoot);
        expect(baseBounds.max.x - baseBounds.min.x)
          .toBeGreaterThan(castleBounds.max.x - castleBounds.min.x);
        expect(baseBounds.max.z - baseBounds.min.z)
          .toBeGreaterThan(castleBounds.max.z - castleBounds.min.z);
      }

      expect(createImageBitmap).toHaveBeenCalledTimes(ASSEMBLIES.length * 4);
      expect(imageDecoder.createObjectURL).toHaveBeenCalledTimes(ASSEMBLIES.length * 4);
      expect(imageDecoder.revokeObjectURL).toHaveBeenCalledTimes(ASSEMBLIES.length * 4);
      expect(imageDecoder.createObjectURL.mock.calls.every(([blob]) => (
        blob.type === 'image/webp' && blob.size > 0
      ))).toBe(true);
      expect(fetchMock.mock.calls.filter(([input]) => (
        requestUrl(input).startsWith('/models/hegemony/')
      )).map(([input]) => requestUrl(input)).sort()).toEqual(
        [...binaries.keys()].sort()
      );

      const repository = createHegemonyKeepPrefabRepository({
        loader: vi.fn(async (lod) => {
          const loaded = loadedByLod.get(lod);
          if (!loaded) throw new Error(`Missing ${lod} production assembly fixture.`);
          return loaded;
        }),
        shareHighResolutionTextures: false
      });
      for (const expected of ASSEMBLIES) {
        leases.push(await repository.acquire(expected.lod));
      }
      resourcesTransferredToRepository = true;
      const prefabs = new Map(leases.map((lease) => [lease.prefab.lod, lease.prefab]));
      leases.forEach(({ prefab }) => {
        expect(prefab.primitives).toHaveLength(2);
        expect(prefab.primitives.map(({ role }) => role)).toEqual([
          'castle',
          'landscape-base'
        ]);
        expect(prefab.landscapeBasePrimitiveCount).toBe(1);
        expect(prefab.landscapeBaseProjectionEnvelope).toBeDefined();
        expect(prefab.renderProjectionEnvelope.localBounds.minX)
          .toBeLessThanOrEqual(prefab.projectionEnvelope.localBounds.minX);
        expect(prefab.renderProjectionEnvelope.localBounds.maxX)
          .toBeGreaterThanOrEqual(prefab.projectionEnvelope.localBounds.maxX);
      });

      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      leases.forEach(({ prefab }) => {
        prefab.primitives.forEach((primitive) => {
          geometries.add(primitive.geometry);
          primitive.materials.forEach((material) => materials.add(material));
        });
      });
      const textures = texturesIn(materials);
      const geometryDisposals = [...geometries].map((geometry) => (
        vi.spyOn(geometry, 'dispose')
      ));
      const materialDisposals = [...materials].map((material) => (
        vi.spyOn(material, 'dispose')
      ));
      const textureDisposals = [...textures].map((texture) => (
        vi.spyOn(texture, 'dispose')
      ));

      layer = createRealmCastleInstanceLayer({
        castles: [{
          castleId: 535,
          coord: { q: 0, r: 0 },
          x: 0,
          groundY: 0,
          z: 0
        }],
        prefabs,
        policy: COMPACT_ONLY_POLICY,
        dynamicShadows: false
      });
      layer.update(createCamera(), 900);
      expect(layer.getPresentationTelemetry()).toEqual({
        presentedModelCount: 1,
        presentedLandscapeBaseCount: 1,
        raycastTargetCount: 1
      });

      const compactPrefab = prefabs.get('compact')!;
      const pickPoint = outsideCastlePoint(compactPrefab);
      expect(pickPoint.x).toSatisfy((x: number) => (
        x > compactPrefab.projectionEnvelope.localBounds.maxX
        || x < compactPrefab.projectionEnvelope.localBounds.minX
      ));
      const raycaster = new THREE.Raycaster(
        pickPoint,
        new THREE.Vector3(0, -1, 0)
      );
      expect(layer.raycast(raycaster)).toEqual({
        castleId: 535,
        coord: { q: 0, r: 0 }
      });

      layer.dispose();
      layer = undefined;
      [...geometryDisposals, ...materialDisposals, ...textureDisposals].forEach((dispose) => {
        expect(dispose).not.toHaveBeenCalled();
      });

      leases.forEach(({ release }) => release());
      geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
      materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
      textureDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
      decodedBitmaps.forEach(({ close }) => expect(close).toHaveBeenCalledOnce());
    } finally {
      layer?.dispose();
      leases.forEach(({ release }) => release());
      if (!resourcesTransferredToRepository) {
        loadedRoots.forEach((root) => disposeRealmObject(root));
      }
      imageDecoder.restore();
    }
  }, 20_000);
});
