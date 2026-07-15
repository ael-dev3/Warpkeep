import * as THREE from 'three';

import { HEGEMONY_MAIN_CASTLE } from '../../game/map/hegemonyLandmarks';
import type { RealmQuality, RealmQualitySpec } from './realmQuality';
import {
  closeImageBitmapOnce,
  imageBitmapSourceForTexture
} from './realmTextureResources';

export const DEFAULT_HEGEMONY_KEEP_REQUEST_TIMEOUT_MS = 20_000;
const MAX_HEGEMONY_KEEP_REQUEST_TIMEOUT_MS = 60_000;

export const HEGEMONY_KEEP_RUNTIME_ASSETS = Object.freeze({
  high: Object.freeze({
    path: HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.high,
    bytes: 1_934_920,
    sha256: '9e49713b5cb59f9b5ac10511652de4c243ba8b1edd2227935f4c9c415304a1a2'
  }),
  balanced: Object.freeze({
    path: HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.balanced,
    bytes: 1_172_132,
    sha256: 'aa3a557b1725dc4bd91e772f44136f72270b0c055c31d8913bb8738405b5934e'
  }),
  reduced: Object.freeze({
    path: HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.compact,
    bytes: 508_508,
    sha256: 'de27e5d43818e4aea225f10f8aa0fafa935b61b2c0c21553c36a8bef916a9c29'
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

/**
 * The renderer-facing portion of a verified keep load. Keeping this in one
 * shared function ensures local visual evidence and production instancing use
 * the same ground alignment, target footprint, yaw, material containment,
 * texture colour space, and shadow flags.
 */
export type PreparedHegemonyKeepScene = Readonly<{
  root: THREE.Group;
  visualHeight: number;
  footprintDiameter: number;
}>;

export type PrepareHegemonyKeepSceneOptions = Readonly<{
  dynamicShadows: boolean;
  maxAnisotropy: number;
}>;

export type LoadHegemonyKeepOptions = Readonly<{
  quality: RealmQualitySpec;
  baseUrl: string;
  maxAnisotropy: number;
  /** Bounds both fetch and response-body work; the default is production-safe. */
  requestTimeoutMs?: number;
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
  if (quality === 'high') return HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.high;
  if (quality === 'balanced') return HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.balanced;
  return HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.compact;
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

function normalizedRequestTimeout(timeoutMs: number | undefined) {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_HEGEMONY_KEEP_REQUEST_TIMEOUT_MS;
  return Math.max(1, Math.min(
    MAX_HEGEMONY_KEEP_REQUEST_TIMEOUT_MS,
    Math.trunc(timeoutMs ?? DEFAULT_HEGEMONY_KEEP_REQUEST_TIMEOUT_MS)
  ));
}

export async function readExactKeepResponseBody(
  response: Response,
  expectedBytes: number
) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
    throw new Error('Invalid Hegemony keep response limit.');
  }
  const declared = response.headers.get('content-length');
  const contentEncoding = response.headers.get('content-encoding');
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) {
      throw new Error('Hegemony keep response has an invalid Content-Length.');
    }
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > expectedBytes) {
      throw new Error('Hegemony keep response exceeds its exact byte budget.');
    }
    if (!contentEncoding && declaredBytes !== expectedBytes) {
      throw new Error('Hegemony keep response does not match its exact byte budget.');
    }
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Hegemony keep response body is not streamable.');
  const output = new Uint8Array(expectedBytes);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (
        !ArrayBuffer.isView(value)
        || value.BYTES_PER_ELEMENT !== 1
        || offset + value.byteLength > expectedBytes
      ) {
        try {
          await reader.cancel('Hegemony keep response exceeded its exact byte budget.');
        } catch {
          // Preserve the bounded-read failure even if stream cancellation fails.
        }
        throw new Error('Hegemony keep response exceeds its exact byte budget.');
      }
      output.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== expectedBytes) {
    throw new Error('Hegemony keep response does not match its exact byte budget.');
  }
  return output.buffer;
}

function requestKeepBinary(
  assetUrl: string,
  asset: KeepRuntimeAsset,
  timeoutMs: number | undefined
) {
  const cached = keepBinaryRequests.get(assetUrl);
  if (cached) return cached;

  const boundedTimeoutMs = normalizedRequestTimeout(timeoutMs);
  const abortController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const fetchRequest = Promise.resolve()
    .then(() => fetch(assetUrl, {
      credentials: 'same-origin',
      redirect: 'error',
      signal: abortController.signal
    }))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Hegemony keep request failed with ${response.status}.`);
      const bytes = await readExactKeepResponseBody(response, asset.bytes);
      if (await sha256Hex(bytes) !== asset.sha256) {
        throw new Error('Hegemony keep model failed its integrity check.');
      }
      return bytes;
    });
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Hegemony keep request timed out after ${boundedTimeoutMs}ms.`));
      abortController.abort();
    }, boundedTimeoutMs);
  });
  let request: KeepBinaryRequest;
  request = Promise.race([fetchRequest, timeout])
    .finally(() => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
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
  targetDiameter = HEGEMONY_MAIN_CASTLE.targetFootprintDiameter
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
  // Preserve authored stone/electrum/fabric separation. Only contain values
  // that become unstable under ACES or missing-device environment support;
  // the old global 0.14/0.58 clamps flattened every material into muddy stone.
  material.metalness = THREE.MathUtils.clamp(material.metalness, 0, 0.92);
  material.roughness = THREE.MathUtils.clamp(material.roughness, 0.2, 1);
  material.envMapIntensity = THREE.MathUtils.clamp(material.envMapIntensity, 0, 1.25);
  if (material.emissiveMap) {
    material.emissiveIntensity = THREE.MathUtils.clamp(material.emissiveIntensity, 0, 1.2);
  }
  tuneTexture(material.map, anisotropy, true);
  tuneTexture(material.emissiveMap, anisotropy, true);
  tuneTexture(material.normalMap, anisotropy);
  tuneTexture(material.metalnessMap, anisotropy);
  tuneTexture(material.roughnessMap, anisotropy);
  tuneTexture(material.aoMap, anisotropy);
  material.needsUpdate = true;
}

/**
 * Normalizes an already integrity-verified parsed GLB into the production
 * castle coordinate frame. It intentionally owns no network or cache state,
 * so a local, source-pinned QA page can exercise the identical visual path
 * without gaining access to player or backend authority.
 */
export function prepareHegemonyKeepScene(
  scene: THREE.Object3D,
  options: PrepareHegemonyKeepSceneOptions
): PreparedHegemonyKeepScene {
  const box = new THREE.Box3().setFromObject(scene);
  const normalization = calculateKeepNormalization({
    minX: box.min.x,
    minY: box.min.y,
    minZ: box.min.z,
    maxX: box.max.x,
    maxY: box.max.y,
    maxZ: box.max.z
  });
  const maxAnisotropy = Number.isFinite(options.maxAnisotropy)
    ? Math.max(1, options.maxAnisotropy)
    : 1;
  scene.scale.setScalar(normalization.scale);
  scene.position.set(
    normalization.offsetX,
    normalization.offsetY,
    normalization.offsetZ
  );
  scene.rotation.y = HEGEMONY_MAIN_CASTLE.yawRadians;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = options.dynamicShadows;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => tuneKeepMaterial(material, maxAnisotropy));
  });
  const root = new THREE.Group();
  root.name = HEGEMONY_MAIN_CASTLE.id;
  root.add(scene);
  return {
    root,
    visualHeight: normalization.visualHeight,
    footprintDiameter: normalization.footprintDiameter,
  };
}

export async function loadHegemonyKeep(
  options: LoadHegemonyKeepOptions
): Promise<HegemonyKeepLoadResult> {
  const assetUrl = resolveRealmAssetUrl(options.baseUrl, options.quality.keepAssetPath);
  const asset = keepRuntimeAssetForPath(options.quality.keepAssetPath);
  const bytes = await requestKeepBinary(assetUrl, asset, options.requestTimeoutMs);
  const scene = await (options.parser ?? parseHegemonyKeep)(
    bytes.slice(0),
    assetUrl.slice(0, assetUrl.lastIndexOf('/') + 1)
  );
  const prepared = prepareHegemonyKeepScene(scene, {
    dynamicShadows: options.quality.dynamicShadows,
    maxAnisotropy: options.maxAnisotropy
  });
  return {
    ...prepared,
    assetUrl
  };
}

export function clearHegemonyKeepBinaryCacheForTests() {
  keepBinaryRequests.clear();
}

function disposeMaterial(
  material: THREE.Material,
  textures: Set<THREE.Texture>,
  closedBitmapSources: WeakSet<ImageBitmap>
) {
  const materialTextures = new Set<THREE.Texture>();
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      materialTextures.add(value);
    } else if (Array.isArray(value)) {
      value.forEach((candidate) => {
        if (candidate instanceof THREE.Texture) materialTextures.add(candidate);
      });
    }
  }
  let firstError: unknown;
  for (const texture of materialTextures) {
    if (textures.has(texture)) continue;
    textures.add(texture);
    const bitmapSource = imageBitmapSourceForTexture(texture);
    try {
      texture.dispose();
    } catch (error) {
      firstError ??= error;
    }
    if (bitmapSource) {
      try {
        closeImageBitmapOnce(bitmapSource, closedBitmapSources);
      } catch (error) {
        firstError ??= error;
      }
    }
  }
  try {
    material.dispose();
  } catch (error) {
    firstError ??= error;
  }
  if (firstError) throw firstError;
}

export function disposeRealmObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const closedBitmapSources = new WeakSet<ImageBitmap>();
  let firstError: unknown;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      try {
        object.geometry.dispose();
      } catch (error) {
        firstError ??= error;
      }
    }
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => {
      if (materials.has(material)) return;
      materials.add(material);
      try {
        disposeMaterial(material, textures, closedBitmapSources);
      } catch (error) {
        firstError ??= error;
      }
    });
  });
  if (firstError) throw firstError;
}
