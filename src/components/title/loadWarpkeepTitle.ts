import * as THREE from 'three';

import {
  titleModelProfileForQuality,
  type GraphicsQualityTier
} from '../../settings/graphicsPreference';

export const WARPKEEP_TITLE_MODELS = {
  high: {
    path: 'models/title/warpkeep-title-high.glb',
    bytes: 3_844_364,
    sha256: '2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5'
  },
  compact: {
    path: 'models/title/warpkeep-title-compact.glb',
    bytes: 1_714_060,
    sha256: 'd29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8'
  }
} as const;

export type WarpkeepTitleModelProfile = keyof typeof WARPKEEP_TITLE_MODELS;

export type LoadedWarpkeepTitle = Readonly<{
  group: THREE.Group;
  safeWidth: number;
  uniformScale: number;
  profile: WarpkeepTitleModelProfile;
}>;

export type WarpkeepTitleParser = (
  bytes: ArrayBuffer,
  resourcePath: string
) => Promise<THREE.Object3D>;

const binaryRequests = new Map<string, Promise<ArrayBuffer>>();

export function resolveWarpkeepTitleModel(
  baseUrl: string,
  quality: GraphicsQualityTier
) {
  const profile = titleModelProfileForQuality(quality);
  const asset = WARPKEEP_TITLE_MODELS[profile];
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return {
    ...asset,
    profile,
    url: `${normalizedBase}${asset.path}`
  };
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchTitleBinary(url: string) {
  let request = binaryRequests.get(url);
  if (!request) {
    request = fetch(url, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Title model request failed with ${response.status}.`);
        return response.arrayBuffer();
      })
      .catch((error) => {
        binaryRequests.delete(url);
        throw error;
      });
    binaryRequests.set(url, request);
  }
  return request;
}

function abortError() {
  return new DOMException('Title model load was cancelled.', 'AbortError');
}

async function parseWarpkeepTitle(bytes: ArrayBuffer, resourcePath: string) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js')
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes, resourcePath);
  return gltf.scene;
}

export function normalizeWarpkeepTitle(
  object: THREE.Object3D,
  targetHeight: number
): Readonly<{ group: THREE.Group; safeWidth: number; uniformScale: number }> {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (
    !Number.isFinite(size.x)
    || !Number.isFinite(size.y)
    || !Number.isFinite(size.z)
    || size.x <= 0
    || size.y <= 0
    || size.z <= 0
  ) {
    throw new Error('Warpkeep title model has invalid bounds.');
  }

  const uniformScale = targetHeight / size.y;
  object.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  const normalization = new THREE.Group();
  normalization.name = 'warpkeep-title-normalization';
  normalization.scale.setScalar(uniformScale);
  normalization.add(object);
  const group = new THREE.Group();
  group.name = 'warpkeep-title-model';
  group.add(normalization);
  group.position.set(0, -1.52, 0.28);
  return { group, safeWidth: size.x * uniformScale, uniformScale };
}

export function disposeObject3DResources(root: THREE.Object3D) {
  const geometries = new Set<string>();
  const materials = new Set<string>();
  const textures = new Set<string>();

  const disposeTexture = (value: unknown) => {
    if (value instanceof THREE.Texture && !textures.has(value.uuid)) {
      textures.add(value.uuid);
      value.dispose();
    }
  };

  root.traverse((object) => {
    const drawable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (drawable.geometry && !geometries.has(drawable.geometry.uuid)) {
      geometries.add(drawable.geometry.uuid);
      drawable.geometry.dispose();
    }
    const objectMaterials = drawable.material
      ? Array.isArray(drawable.material) ? drawable.material : [drawable.material]
      : [];
    objectMaterials.forEach((material) => {
      if (materials.has(material.uuid)) return;
      materials.add(material.uuid);
      Object.values(material).forEach(disposeTexture);
      const uniforms = (material as THREE.ShaderMaterial).uniforms;
      if (uniforms) Object.values(uniforms).forEach((uniform) => disposeTexture(uniform.value));
      material.dispose();
    });
  });
}

export async function loadWarpkeepTitle({
  baseUrl,
  quality,
  targetHeight,
  signal,
  parser = parseWarpkeepTitle
}: Readonly<{
  baseUrl: string;
  quality: GraphicsQualityTier;
  targetHeight: number;
  signal?: AbortSignal;
  parser?: WarpkeepTitleParser;
}>): Promise<LoadedWarpkeepTitle> {
  const asset = resolveWarpkeepTitleModel(baseUrl, quality);
  if (signal?.aborted) throw abortError();
  const bytes = await fetchTitleBinary(asset.url);
  if (signal?.aborted) throw abortError();
  if (bytes.byteLength !== asset.bytes || await sha256Hex(bytes) !== asset.sha256) {
    throw new Error(`Warpkeep ${asset.profile} title model failed its integrity check.`);
  }

  const scene = await parser(
    bytes.slice(0),
    asset.url.slice(0, asset.url.lastIndexOf('/') + 1)
  );
  if (signal?.aborted) {
    disposeObject3DResources(scene);
    throw abortError();
  }
  try {
    const normalized = normalizeWarpkeepTitle(scene, targetHeight);
    return { ...normalized, profile: asset.profile };
  } catch (error) {
    disposeObject3DResources(scene);
    throw error;
  }
}

export function clearWarpkeepTitleBinaryCacheForTests() {
  binaryRequests.clear();
}
