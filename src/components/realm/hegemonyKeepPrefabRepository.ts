import * as THREE from 'three';

import {
  disposeRealmObject,
  type HegemonyKeepLoadResult
} from './loadHegemonyKeep';
import { loadHegemonyCastleAssembly } from './loadHegemonyCastleAssembly';
import { REALM_QUALITY_SPECS } from './realmQuality';
import type { CastleLod } from './castleInstancePlanning';
import {
  createCastleBoundsProjectionEnvelope,
  deriveCastleProjectionEnvelope,
  type RealmCastleProjectionEnvelope
} from './realmCastleProjectionGeometry';
import {
  closeImageBitmapOnce,
  uniqueImageBitmapSources
} from './realmTextureResources';

export type HegemonyKeepPrefabPrimitive = Readonly<{
  geometry: THREE.BufferGeometry;
  /** Shared and repository-owned. Consumers must not mutate or dispose it. */
  materials: readonly THREE.Material[];
  /** Column-major Matrix4 elements relative to the normalized prefab root. */
  localMatrixElements: readonly number[];
  sourceMeshName: string;
  /** Omitted custom/test primitives are treated as castle geometry. */
  role?: 'castle' | 'landscape-base';
}>;

export type HegemonyKeepPrefab = Readonly<{
  lod: CastleLod;
  assetUrl: string;
  footprintDiameter: number;
  visualHeight: number;
  /** Immutable, bounded geometry used for honest screen-space occlusion. */
  projectionEnvelope: RealmCastleProjectionEnvelope;
  /** Castle plus authored landscape geometry used for conservative occupancy. */
  renderProjectionEnvelope: RealmCastleProjectionEnvelope;
  /** Exact authored base geometry used to derive the simple oval pick volume. */
  landscapeBaseProjectionEnvelope?: RealmCastleProjectionEnvelope;
  landscapeBasePrimitiveCount: number;
  /**
   * Immutable prefab description. Geometry, materials, and their textures are
   * shared repository resources and must only be used to create render nodes.
   */
  primitives: readonly HegemonyKeepPrefabPrimitive[];
}>;

export type HegemonyKeepPrefabLease = Readonly<{
  prefab: HegemonyKeepPrefab;
  /** Idempotent. The final lease disposes every unique shared resource once. */
  release: () => void;
}>;

export type HegemonyKeepPrefabLoader = (
  lod: CastleLod
) => Promise<HegemonyKeepLoadResult>;

export type HegemonyKeepPrefabRepository = Readonly<{
  /**
   * Coalesces concurrent acquisition. A retired LOD cannot be reacquired in
   * the same realm session because its GPU resources have already been freed.
   */
  acquire: (lod: CastleLod) => Promise<HegemonyKeepPrefabLease>;
}>;

export type CreateHegemonyKeepPrefabRepositoryOptions = Readonly<{
  baseUrl?: string;
  maxAnisotropy?: number;
  loader?: HegemonyKeepPrefabLoader;
  /**
   * Permit compatible High/Balanced textures to be shared when their decoded
   * dimensions and authored material state match. Custom loaders must opt in
   * because the repository cannot prove their source bytes.
   */
  shareHighResolutionTextures?: boolean;
}>;

type PrefabResources = Readonly<{
  geometries: readonly THREE.BufferGeometry[];
  materials: readonly THREE.Material[];
  textures: readonly THREE.Texture[];
  bitmapSources: readonly ImageBitmap[];
}>;

type InternalPrefab = Readonly<{
  prefab: HegemonyKeepPrefab;
  resources: PrefabResources;
}>;

type CacheEntry = {
  activeLeases: number;
  promise: Promise<InternalPrefab>;
  retired: boolean;
};

type SharedResource = THREE.BufferGeometry | THREE.Material | THREE.Texture;

function qualityForLod(lod: CastleLod) {
  if (lod === 'high') return REALM_QUALITY_SPECS.high;
  if (lod === 'balanced') return REALM_QUALITY_SPECS.balanced;
  return REALM_QUALITY_SPECS.reduced;
}

function createDefaultLoader(
  baseUrl: string,
  maxAnisotropy: number
): HegemonyKeepPrefabLoader {
  return (lod) => loadHegemonyCastleAssembly({
    quality: qualityForLod(lod),
    baseUrl,
    maxAnisotropy
  });
}

function collectMaterialTextures(
  material: THREE.Material,
  textures: Set<THREE.Texture>
) {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      textures.add(value);
    } else if (Array.isArray(value)) {
      value.forEach((candidate) => {
        if (candidate instanceof THREE.Texture) textures.add(candidate);
      });
    }
  }
}

function unionProjectionEnvelopes(
  castle: RealmCastleProjectionEnvelope,
  landscapeBase: RealmCastleProjectionEnvelope
) {
  return createCastleBoundsProjectionEnvelope({
    minX: Math.min(castle.localBounds.minX, landscapeBase.localBounds.minX),
    minY: Math.min(castle.localBounds.minY, landscapeBase.localBounds.minY),
    minZ: Math.min(castle.localBounds.minZ, landscapeBase.localBounds.minZ),
    maxX: Math.max(castle.localBounds.maxX, landscapeBase.localBounds.maxX),
    maxY: Math.max(castle.localBounds.maxY, landscapeBase.localBounds.maxY),
    maxZ: Math.max(castle.localBounds.maxZ, landscapeBase.localBounds.maxZ)
  });
}

function createInternalPrefab(
  lod: CastleLod,
  loaded: HegemonyKeepLoadResult
): InternalPrefab {
  const geometrySet = new Set<THREE.BufferGeometry>();
  const materialSet = new Set<THREE.Material>();
  const textureSet = new Set<THREE.Texture>();
  const primitives: HegemonyKeepPrefabPrimitive[] = [];
  const rootWorldInverse = new THREE.Matrix4();

  loaded.root.updateWorldMatrix(true, true);
  rootWorldInverse.copy(loaded.root.matrixWorld).invert();
  loaded.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Object.freeze(
      Array.isArray(object.material) ? [...object.material] : [object.material]
    );
    geometrySet.add(object.geometry);
    materials.forEach((material) => {
      materialSet.add(material);
      collectMaterialTextures(material, textureSet);
    });
    const localMatrix = rootWorldInverse.clone().multiply(object.matrixWorld);
    primitives.push(Object.freeze({
      geometry: object.geometry,
      materials,
      localMatrixElements: Object.freeze([...localMatrix.elements]),
      sourceMeshName: object.name,
      role: object.userData.warpkeepPrefabRole === 'landscape-base'
        ? 'landscape-base'
        : 'castle'
    }));
  });

  if (primitives.length === 0) {
    throw new Error(`Hegemony keep ${lod} prefab contains no renderable meshes.`);
  }
  const castlePrimitives = primitives.filter((primitive) => primitive.role !== 'landscape-base');
  const landscapeBasePrimitives = primitives.filter((primitive) => (
    primitive.role === 'landscape-base'
  ));
  const projectionEnvelope = deriveCastleProjectionEnvelope(castlePrimitives);
  if (!projectionEnvelope) {
    throw new Error(`Hegemony keep ${lod} prefab has no valid projection bounds.`);
  }
  const landscapeBaseProjectionEnvelope = deriveCastleProjectionEnvelope(
    landscapeBasePrimitives
  ) ?? undefined;
  const renderProjectionEnvelope = landscapeBaseProjectionEnvelope
    ? unionProjectionEnvelopes(projectionEnvelope, landscapeBaseProjectionEnvelope)
    : projectionEnvelope;
  if (!renderProjectionEnvelope) {
    throw new Error(`Hegemony keep ${lod} prefab has no valid render bounds.`);
  }
  if (
    !Number.isFinite(loaded.visualHeight)
    || loaded.visualHeight <= 0
    || !Number.isFinite(loaded.footprintDiameter)
    || loaded.footprintDiameter <= 0
  ) {
    throw new Error(`Hegemony keep ${lod} prefab has invalid normalized bounds.`);
  }

  return Object.freeze({
    prefab: Object.freeze({
      lod,
      assetUrl: loaded.assetUrl,
      footprintDiameter: loaded.footprintDiameter,
      visualHeight: loaded.visualHeight,
      projectionEnvelope,
      renderProjectionEnvelope,
      landscapeBaseProjectionEnvelope,
      landscapeBasePrimitiveCount: primitives.length - castlePrimitives.length,
      primitives: Object.freeze(primitives)
    }),
    resources: Object.freeze({
      geometries: Object.freeze([...geometrySet]),
      materials: Object.freeze([...materialSet]),
      textures: Object.freeze([...textureSet]),
      bitmapSources: uniqueImageBitmapSources(textureSet)
    })
  });
}

function resourcesIn(bundle: PrefabResources): readonly SharedResource[] {
  return [...bundle.geometries, ...bundle.materials, ...bundle.textures];
}

type TextureAssignment = Readonly<{
  canonical: THREE.Texture;
  duplicate: THREE.Texture;
  key: string;
  material: THREE.Material & Record<string, unknown>;
}>;

function orderedPrefabMaterials(prefab: HegemonyKeepPrefab) {
  const seen = new Set<THREE.Material>();
  const materials: THREE.Material[] = [];
  prefab.primitives.forEach((primitive) => {
    primitive.materials.forEach((material) => {
      if (seen.has(material)) return;
      seen.add(material);
      materials.push(material);
    });
  });
  return materials;
}

function materialTextureEntries(material: THREE.Material) {
  return Object.entries(material as THREE.Material & Record<string, unknown>)
    .filter((entry): entry is [string, THREE.Texture] => entry[1] instanceof THREE.Texture)
    .sort(([left], [right]) => left.localeCompare(right));
}

function sameVector2(left: THREE.Vector2, right: THREE.Vector2) {
  return left.x === right.x && left.y === right.y;
}

function compatibleTexture(left: THREE.Texture, right: THREE.Texture) {
  const leftImage = left.source.data as { width?: number; height?: number } | undefined;
  const rightImage = right.source.data as { width?: number; height?: number } | undefined;
  return left.mapping === right.mapping
    && left.channel === right.channel
    && left.wrapS === right.wrapS
    && left.wrapT === right.wrapT
    && left.magFilter === right.magFilter
    && left.minFilter === right.minFilter
    && left.anisotropy === right.anisotropy
    && left.format === right.format
    && left.internalFormat === right.internalFormat
    && left.type === right.type
    && left.colorSpace === right.colorSpace
    && left.flipY === right.flipY
    && left.generateMipmaps === right.generateMipmaps
    && left.premultiplyAlpha === right.premultiplyAlpha
    && left.unpackAlignment === right.unpackAlignment
    && left.matrixAutoUpdate === right.matrixAutoUpdate
    && left.rotation === right.rotation
    && sameVector2(left.offset, right.offset)
    && sameVector2(left.repeat, right.repeat)
    && sameVector2(left.center, right.center)
    && left.matrix.equals(right.matrix)
    && leftImage?.width === rightImage?.width
    && leftImage?.height === rightImage?.height;
}

function compatibleMaterial(left: THREE.Material, right: THREE.Material) {
  if (
    left.type !== right.type
    || left.side !== right.side
    || left.transparent !== right.transparent
    || left.opacity !== right.opacity
    || left.alphaTest !== right.alphaTest
    || left.depthTest !== right.depthTest
    || left.depthWrite !== right.depthWrite
    || left.vertexColors !== right.vertexColors
  ) return false;
  if (left instanceof THREE.MeshStandardMaterial && right instanceof THREE.MeshStandardMaterial) {
    return left.color.equals(right.color)
      && left.emissive.equals(right.emissive)
      && left.metalness === right.metalness
      && left.roughness === right.roughness
      && left.emissiveIntensity === right.emissiveIntensity
      && left.envMapIntensity === right.envMapIntensity
      && left.aoMapIntensity === right.aoMapIntensity
      && sameVector2(left.normalScale, right.normalScale);
  }
  return left.constructor === right.constructor;
}

/**
 * Shares only compatible texture objects. Geometry and material instances
 * remain per LOD, preserving authored mesh/material state.
 */
function shareHighResolutionTextureSet(
  canonical: InternalPrefab,
  incoming: InternalPrefab
): Readonly<{
  internal: InternalPrefab;
  duplicateBitmapSources: readonly ImageBitmap[];
  duplicateTextures: readonly THREE.Texture[];
}> {
  const canonicalMaterials = orderedPrefabMaterials(canonical.prefab);
  const incomingMaterials = orderedPrefabMaterials(incoming.prefab);
  if (canonicalMaterials.length !== incomingMaterials.length) {
    return { internal: incoming, duplicateBitmapSources: [], duplicateTextures: [] };
  }

  const assignments: TextureAssignment[] = [];
  for (let index = 0; index < canonicalMaterials.length; index += 1) {
    const canonicalMaterial = canonicalMaterials[index];
    const incomingMaterial = incomingMaterials[index];
    if (!compatibleMaterial(canonicalMaterial, incomingMaterial)) {
      return { internal: incoming, duplicateBitmapSources: [], duplicateTextures: [] };
    }
    const canonicalTextures = materialTextureEntries(canonicalMaterial);
    const incomingTextures = materialTextureEntries(incomingMaterial);
    if (
      canonicalTextures.length !== incomingTextures.length
      || canonicalTextures.some(([key], textureIndex) => key !== incomingTextures[textureIndex]?.[0])
    ) return { internal: incoming, duplicateBitmapSources: [], duplicateTextures: [] };
    for (let textureIndex = 0; textureIndex < canonicalTextures.length; textureIndex += 1) {
      const [key, canonicalTexture] = canonicalTextures[textureIndex];
      const duplicate = incomingTextures[textureIndex]?.[1];
      if (!duplicate || !compatibleTexture(canonicalTexture, duplicate)) {
        return { internal: incoming, duplicateBitmapSources: [], duplicateTextures: [] };
      }
      assignments.push({
        canonical: canonicalTexture,
        duplicate,
        key,
        material: incomingMaterial as THREE.Material & Record<string, unknown>
      });
    }
  }

  const assignedIncomingTextures = new Set(assignments.map(({ duplicate }) => duplicate));
  const assignedCanonicalTextures = new Set(assignments.map(({ canonical: texture }) => texture));
  if (
    assignedIncomingTextures.size !== incoming.resources.textures.length
    || assignedCanonicalTextures.size !== canonical.resources.textures.length
  ) return { internal: incoming, duplicateBitmapSources: [], duplicateTextures: [] };

  assignments.forEach(({ canonical: texture, key, material }) => {
    material[key] = texture;
  });
  const textures = new Set<THREE.Texture>();
  incoming.resources.materials.forEach((material) => collectMaterialTextures(material, textures));
  const duplicateTextures = incoming.resources.textures.filter((texture) => !textures.has(texture));
  const bitmapSources = uniqueImageBitmapSources(textures);
  const retainedBitmapSources = new Set(bitmapSources);
  const duplicateBitmapSources = incoming.resources.bitmapSources.filter((source) => (
    !retainedBitmapSources.has(source)
  ));
  return {
    internal: Object.freeze({
      prefab: incoming.prefab,
      resources: Object.freeze({
        geometries: incoming.resources.geometries,
        materials: incoming.resources.materials,
        textures: Object.freeze([...textures]),
        bitmapSources
      })
    }),
    duplicateBitmapSources: Object.freeze(duplicateBitmapSources),
    duplicateTextures: Object.freeze(duplicateTextures)
  };
}

/**
 * Creates one repository for one mounted Realm lifetime. Callers should retain
 * their leases until their corresponding instance layers are detached.
 */
export function createHegemonyKeepPrefabRepository(
  options: CreateHegemonyKeepPrefabRepositoryOptions = {}
): HegemonyKeepPrefabRepository {
  const baseUrl = options.baseUrl ?? '/';
  const maxAnisotropy = Number.isFinite(options.maxAnisotropy)
    ? Math.max(1, options.maxAnisotropy ?? 1)
    : 1;
  const loader = options.loader ?? createDefaultLoader(baseUrl, maxAnisotropy);
  const shareHighResolutionTextures = options.shareHighResolutionTextures
    ?? options.loader === undefined;
  const entries = new Map<CastleLod, CacheEntry>();
  const retainCounts = new Map<SharedResource, number>();
  const disposedResources = new WeakSet<SharedResource>();
  const bitmapRetainCounts = new Map<ImageBitmap, number>();
  const closedBitmapSources = new WeakSet<ImageBitmap>();
  let highResolutionCanonical: InternalPrefab | undefined;

  const retain = (resources: PrefabResources) => {
    const shared = resourcesIn(resources);
    if (shared.some((resource) => disposedResources.has(resource))) {
      throw new Error('Cannot retain a disposed Hegemony keep prefab resource.');
    }
    if (resources.bitmapSources.some((source) => closedBitmapSources.has(source))) {
      throw new Error('Cannot retain a closed Hegemony keep ImageBitmap source.');
    }
    shared.forEach((resource) => {
      retainCounts.set(resource, (retainCounts.get(resource) ?? 0) + 1);
    });
    resources.bitmapSources.forEach((source) => {
      bitmapRetainCounts.set(source, (bitmapRetainCounts.get(source) ?? 0) + 1);
    });
  };

  const release = (resources: PrefabResources) => {
    let firstError: unknown;
    resourcesIn(resources).forEach((resource) => {
      const count = retainCounts.get(resource);
      if (count === undefined || count <= 0) {
        firstError ??= new Error('Hegemony keep prefab resource retain count underflow.');
        return;
      }
      if (count > 1) {
        retainCounts.set(resource, count - 1);
        return;
      }
      retainCounts.delete(resource);
      disposedResources.add(resource);
      try {
        resource.dispose();
      } catch (error) {
        firstError ??= error;
      }
    });
    resources.bitmapSources.forEach((source) => {
      const count = bitmapRetainCounts.get(source);
      if (count === undefined || count <= 0) {
        firstError ??= new Error('Hegemony keep ImageBitmap retain count underflow.');
        return;
      }
      if (count > 1) {
        bitmapRetainCounts.set(source, count - 1);
        return;
      }
      bitmapRetainCounts.delete(source);
      try {
        closeImageBitmapOnce(source, closedBitmapSources);
      } catch (error) {
        firstError ??= error;
      }
    });
    if (firstError) throw firstError;
  };

  const prepareInternalPrefab = (lod: CastleLod, loaded: HegemonyKeepLoadResult) => {
    let internal: InternalPrefab;
    try {
      internal = createInternalPrefab(lod, loaded);
    } catch (error) {
      try {
        disposeRealmObject(loaded.root);
      } catch {
        // Preserve the validation failure while still attempting full cleanup.
      }
      throw error;
    }
    if (shareHighResolutionTextures && (lod === 'high' || lod === 'balanced')) {
      const canonicalAvailable = highResolutionCanonical
        && highResolutionCanonical.resources.textures.every((texture) => (
          !disposedResources.has(texture)
        ));
      if (canonicalAvailable && highResolutionCanonical) {
        const shared = shareHighResolutionTextureSet(highResolutionCanonical, internal);
        internal = shared.internal;
        shared.duplicateTextures.forEach((texture) => {
          disposedResources.add(texture);
          try {
            texture.dispose();
          } catch {
            // The duplicate is already detached; keep preparing the real prefab.
          }
        });
        shared.duplicateBitmapSources.forEach((source) => {
          try {
            closeImageBitmapOnce(source, closedBitmapSources);
          } catch {
            // Detached duplicate cleanup cannot invalidate the retained prefab.
          }
        });
      } else {
        highResolutionCanonical = internal;
      }
    }
    // One retain belongs to the cache entry rather than each lease. This keeps
    // cross-LOD textures alive while either independently leased LOD needs them.
    retain(internal.resources);
    return internal;
  };

  const entryFor = (lod: CastleLod) => {
    const cached = entries.get(lod);
    if (cached) return cached;
    const entry: CacheEntry = {
      activeLeases: 0,
      promise: Promise.resolve()
        .then(() => loader(lod))
        .then((loaded) => prepareInternalPrefab(lod, loaded)),
      retired: false
    };
    entries.set(lod, entry);
    return entry;
  };

  return Object.freeze({
    acquire: async (lod) => {
      const entry = entryFor(lod);
      if (entry.retired) {
        throw new Error(`Hegemony keep ${lod} prefab is retired for this realm session.`);
      }
      const internal = await entry.promise;
      // A previous lease can retire a resolved entry while this acquisition is
      // queued behind the shared promise. Never revive already-freed resources.
      if (entry.retired) {
        throw new Error(`Hegemony keep ${lod} prefab is retired for this realm session.`);
      }
      entry.activeLeases += 1;
      let released = false;

      return Object.freeze({
        prefab: internal.prefab,
        release: () => {
          if (released) return;
          released = true;
          entry.activeLeases -= 1;
          if (entry.activeLeases === 0) {
            entry.retired = true;
            release(internal.resources);
          }
        }
      });
    }
  });
}
