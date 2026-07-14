import * as THREE from 'three';

import { HEGEMONY_FRONTIER_KEEP } from '../../game/map/hegemonyLandmarks';
import type { RealmQuality, RealmQualitySpec } from './realmQuality';

const KEEP_TARGET_DIAMETER = 1.48;

export const HEGEMONY_KEEP_RUNTIME_ASSETS = Object.freeze({
  high: Object.freeze({
    path: HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.high,
    bytes: 2_256_092,
    sha256: 'ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c'
  }),
  balanced: Object.freeze({
    path: HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.balanced,
    bytes: 2_064_100,
    sha256: 'bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4'
  }),
  reduced: Object.freeze({
    path: HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.compact,
    bytes: 760_916,
    sha256: '9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b'
  })
});

type KeepRuntimeAsset = (typeof HEGEMONY_KEEP_RUNTIME_ASSETS)[keyof typeof HEGEMONY_KEEP_RUNTIME_ASSETS];
type KeepBinaryRequest = Promise<ArrayBuffer>;

const keepBinaryRequests = new Map<string, KeepBinaryRequest>();

export type KeepNormalization = Readonly<{
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  visualHeight: number;
  footprintDiameter: number;
}>;

export type HegemonyKeepLoadResult = Readonly<{
  root: THREE.Group;
  visualHeight: number;
  footprintDiameter: number;
  assetUrl: string;
}>;

export type LoadHegemonyKeepOptions = Readonly<{
  quality: RealmQualitySpec;
  baseUrl: string;
  maxAnisotropy: number;
  parser?: HegemonyKeepParser;
}>;

export type HegemonyKeepParser = (
  bytes: ArrayBuffer,
  resourcePath: string
) => Promise<THREE.Object3D>;

export function resolveRealmAssetUrl(baseUrl: string, assetPath: string) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
}
export function keepAssetPathForQuality(quality: RealmQuality) {
  if (quality === 'high') return HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.high;
  if (quality === 'balanced') return HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.balanced;
  return HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.compact;
}

function keepRuntimeAssetForPath(path: string): KeepRuntimeAsset {
  const asset = Object.values(HEGEMONY_KEEP_RUNTIME_ASSETS)
    .find((candidate) => candidate.path === path);
  if (!asset) throw new Error('Unsupported Hegemony keep runtime asset.');
  return asset;
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function requestKeepBinary(assetUrl: string, asset: KeepRuntimeAsset) {
  const cached = keepBinaryRequests.get(assetUrl);
  if (cached) return cached;

  let request: KeepBinaryRequest;
  request = fetch(assetUrl, { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Hegemony keep request failed with ${response.status}.`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== asset.bytes || await sha256Hex(bytes) !== asset.sha256) {
        throw new Error('Hegemony keep model failed its integrity check.');
      }
      return bytes;
    })
    .catch((error) => {
      if (keepBinaryRequests.get(assetUrl) === request) keepBinaryRequests.delete(assetUrl);
      throw error;
    });
  keepBinaryRequests.set(assetUrl, request);
  return request;
}

async function parseHegemonyKeep(bytes: ArrayBuffer, resourcePath: string) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js')
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const loaded = await loader.parseAsync(bytes, resourcePath);
  return loaded.scene;
}

export function calculateKeepNormalization(
  bounds: Readonly<{
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  }>,
  targetDiameter = KEEP_TARGET_DIAMETER
): KeepNormalization {
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const depth = Math.max(0.001, bounds.maxZ - bounds.minZ);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);
  const scale = Math.max(0.001, targetDiameter) / Math.max(width, depth);
  return {
    scale,
    offsetX: -((bounds.minX + bounds.maxX) / 2) * scale,
    offsetY: -bounds.minY * scale,
    offsetZ: -((bounds.minZ + bounds.maxZ) / 2) * scale,
    visualHeight: height * scale,
    footprintDiameter: Math.max(width, depth) * scale
  };
}

function tuneTexture(texture: THREE.Texture | null, anisotropy: number, color = false) {
  if (!texture) return;
  texture.anisotropy = Math.max(1, Math.min(8, anisotropy));
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
}

function tuneKeepMaterial(material: THREE.Material, anisotropy: number) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  material.metalness = Math.min(material.metalness, 0.14);
  material.roughness = Math.max(material.roughness, 0.58);
  material.envMapIntensity = Math.min(material.envMapIntensity, 0.4);
  if (material.emissiveMap) material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.045);
  tuneTexture(material.map, anisotropy, true);
  tuneTexture(material.emissiveMap, anisotropy, true);
  tuneTexture(material.normalMap, anisotropy);
  tuneTexture(material.metalnessMap, anisotropy);
  tuneTexture(material.roughnessMap, anisotropy);
  tuneTexture(material.aoMap, anisotropy);
  material.needsUpdate = true;
}

export function createHegemonyKeepPlaceholder(failed = false) {
  const root = new THREE.Group();
  root.name = failed ? 'hegemony-keep-fallback' : 'hegemony-keep-loading';
  const stone = new THREE.MeshStandardMaterial({
    color: failed ? '#8c7a61' : '#d6c9aa',
    roughness: 0.82,
    metalness: 0.02,
    transparent: !failed,
    opacity: failed ? 1 : 0.58
  });
  const gold = new THREE.MeshStandardMaterial({
    color: '#a8843f',
    roughness: 0.62,
    metalness: 0.28,
    transparent: !failed,
    opacity: failed ? 1 : 0.65
  });
  const keep = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.46), stone);
  keep.position.y = 0.21;
  root.add(keep);
  [-0.43, 0.43].forEach((x) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.62, 12), stone);
    tower.position.set(x, 0.31, 0.08);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.2, 12), gold);
    roof.position.set(x, 0.72, 0.08);
    root.add(tower, roof);
  });
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = failed;
      object.receiveShadow = true;
    }
  });
  return root;
}

export async function loadHegemonyKeep(
  options: LoadHegemonyKeepOptions
): Promise<HegemonyKeepLoadResult> {
  const assetUrl = resolveRealmAssetUrl(options.baseUrl, options.quality.keepAssetPath);
  const asset = keepRuntimeAssetForPath(options.quality.keepAssetPath);
  const bytes = await requestKeepBinary(assetUrl, asset);
  const scene = await (options.parser ?? parseHegemonyKeep)(
    bytes.slice(0),
    assetUrl.slice(0, assetUrl.lastIndexOf('/') + 1)
  );
  const box = new THREE.Box3().setFromObject(scene);
  const normalization = calculateKeepNormalization({
    minX: box.min.x,
    minY: box.min.y,
    minZ: box.min.z,
    maxX: box.max.x,
    maxY: box.max.y,
    maxZ: box.max.z
  });
  scene.scale.setScalar(normalization.scale);
  scene.position.set(
    normalization.offsetX,
    normalization.offsetY,
    normalization.offsetZ
  );
  scene.rotation.y = HEGEMONY_FRONTIER_KEEP.yawRadians;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = options.quality.dynamicShadows;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => tuneKeepMaterial(material, options.maxAnisotropy));
  });
  const root = new THREE.Group();
  root.name = HEGEMONY_FRONTIER_KEEP.id;
  root.add(scene);
  return {
    root,
    visualHeight: normalization.visualHeight,
    footprintDiameter: normalization.footprintDiameter,
    assetUrl
  };
}

export function clearHegemonyKeepBinaryCacheForTests() {
  keepBinaryRequests.clear();
}

function disposeMaterial(material: THREE.Material, textures: Set<THREE.Texture>) {
  const textureMaterial = material as THREE.Material & Record<string, unknown>;
  [
    'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap',
    'map', 'metalnessMap', 'normalMap', 'roughnessMap'
  ].forEach((key) => {
    const texture = textureMaterial[key];
    if (texture instanceof THREE.Texture && !textures.has(texture)) {
      textures.add(texture);
      texture.dispose();
    }
  });
  material.dispose();
}

export function disposeRealmObject(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => disposeMaterial(material, textures));
  });
}
