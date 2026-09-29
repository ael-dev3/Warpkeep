import * as THREE from 'three';

import { GREATER_REALM_BIOME_TREE_V3 } from './biomeTreeV3Catalog';
import type { GreaterRealmGraphicsProfile } from './greaterRealmRuntimePolicy';

export type GreaterRealmBiomeTreePrototype = Readonly<{
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  scale: number;
  triangles: number;
  geometryBytes: number;
}>;

type AssetRow = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
  triangles: number;
  geometryBytes: number;
  targetHeight: number;
  label: string;
}>;

const ASSET_REQUEST_TIMEOUT_MS = 20_000;
const cache = new Map<string, Promise<GreaterRealmBiomeTreePrototype>>();
const warned = new Set<string>();

export function resolveGreaterRealmBiomeTreeAssetPath(
  assetPath: string,
  baseUrl: string = import.meta.env.BASE_URL || '/'
) {
  const normalizedBase = baseUrl.replace(/\/?$/, '/');
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
}

function assetFor(biomeClass: number, graphicsProfile: GreaterRealmGraphicsProfile): AssetRow {
  const biome = GREATER_REALM_BIOME_TREE_V3[biomeClass as keyof typeof GREATER_REALM_BIOME_TREE_V3];
  if (!biome) throw new Error(`GREATER_REALM_TREE_BIOME_MISSING:${biomeClass}`);
  return (graphicsProfile === 'high' ? biome.high : biome.mobile) as AssetRow;
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function parseTreeAsset(asset: AssetRow): Promise<GreaterRealmBiomeTreePrototype> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASSET_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(resolveGreaterRealmBiomeTreeAssetPath(asset.path), {
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`request failed with ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== asset.bytes) throw new Error('byte length did not match the pinned catalog');
    if (await sha256Hex(bytes) !== asset.sha256) throw new Error('SHA-256 did not match the pinned catalog');

    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(bytes, '');
    gltf.scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    if (meshes.length !== 1) throw new Error(`expected one instanced mesh, received ${meshes.length}`);
    const source = meshes[0]!;
    if (Array.isArray(source.material) || !(source.material instanceof THREE.MeshStandardMaterial)) {
      throw new Error('runtime atlas material is not a single standard material');
    }
    const texture = source.material.map;
    if (!texture) throw new Error('runtime atlas texture is missing');
    const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const height = geometry.boundingBox
      ? geometry.boundingBox.max.y - geometry.boundingBox.min.y
      : 0;
    if (!(height > 0) || !Number.isFinite(height)) throw new Error('model has no finite vertical bounds');

    const material = source.material;
    material.name = `${asset.label} v3 foliage and bark`;
    material.side = THREE.DoubleSide;
    material.roughness = 0.9;
    material.metalness = 0;
    material.fog = true;
    material.vertexColors = geometry.getAttribute('color') !== undefined;
    material.alphaTest = 0.42;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    geometry.userData.greaterRealmSharedTreeAsset = true;
    material.userData.greaterRealmSharedTreeAsset = true;

    return Object.freeze({
      geometry,
      material,
      scale: asset.targetHeight / height,
      triangles: asset.triangles,
      geometryBytes: asset.geometryBytes
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function loadGreaterRealmBiomeTreePrototype(
  biomeClass: number,
  graphicsProfile: GreaterRealmGraphicsProfile
): Promise<GreaterRealmBiomeTreePrototype> {
  const asset = assetFor(biomeClass, graphicsProfile);
  const key = `${biomeClass}:${asset.path}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const promise = parseTreeAsset(asset).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`Greater Realm v3 tree ${asset.label} could not load; temporary tree geometry remains active.`, message);
    }
    throw error;
  });
  cache.set(key, promise);
  void promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });
  return promise;
}
