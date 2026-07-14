import * as THREE from 'three';

import {
  titleModelProfileForQuality,
  type GraphicsQualityTier
} from '../../settings/graphicsPreference';

export const WARPKEEP_TITLE_MODELS = {
  high: {
    path: 'models/title/warpkeep-title-high.glb',
    bytes: 3_844_364,
    sha256: '2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5',
    primaryTimeoutMs: 20_000,
    sourceBounds: {
      min: [-6.8276704862, -0.0000545372, -0.2499984896],
      max: [6.8277085873, 1.9000545372, 0.2499984896]
    },
    normalized: {
      safeWidth: 15.6668513296,
      visualHeight: 2.18,
      depth: 0.5736478127,
      uniformScale: 1.1473025571,
      pivot: 'bottom-center'
    }
  },
  compact: {
    path: 'models/title/warpkeep-title-compact.glb',
    bytes: 1_714_060,
    sha256: 'd29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8',
    primaryTimeoutMs: 16_000,
    sourceBounds: {
      min: [-6.8278748744, -0.0000083843, -0.250056647],
      max: [6.8279107023, 1.9000083843, 0.250056647]
    },
    normalized: {
      safeWidth: 15.6680788548,
      visualHeight: 2.18,
      depth: 0.5738091363,
      uniformScale: 1.1473582949,
      pivot: 'bottom-center'
    }
  }
} as const;

export const WARPKEEP_TITLE_LAYOUT = Object.freeze({
  safeWidth: WARPKEEP_TITLE_MODELS.compact.normalized.safeWidth,
  visualHeight: 2.18,
  anchor: [0, -1.52, 0.28] as const,
  pivot: 'bottom-center' as const
});

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

type TitleBinaryRequest = {
  controller: AbortController;
  promise: Promise<ArrayBuffer>;
  consumers: number;
  releaseGeneration: number;
  settled: boolean;
};

const binaryRequests = new Map<string, TitleBinaryRequest>();

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

function abortError() {
  return new DOMException('Title model load was cancelled.', 'AbortError');
}

function createTitleBinaryRequest(asset: ReturnType<typeof resolveWarpkeepTitleModel>) {
  const controller = new AbortController();
  const request: TitleBinaryRequest = {
    controller,
    consumers: 0,
    releaseGeneration: 0,
    settled: false,
    promise: Promise.resolve(new ArrayBuffer(0))
  };
  request.promise = fetch(asset.url, {
    credentials: 'same-origin',
    signal: controller.signal
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Title model request failed with ${response.status}.`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== asset.bytes || await sha256Hex(bytes) !== asset.sha256) {
      throw new Error(`Warpkeep ${asset.profile} title model failed its integrity check.`);
    }
    request.settled = true;
    return bytes;
  }).catch((error) => {
    request.settled = true;
    if (binaryRequests.get(asset.url) === request) binaryRequests.delete(asset.url);
    throw error;
  });
  binaryRequests.set(asset.url, request);
  return request;
}

function acquireTitleBinary(
  asset: ReturnType<typeof resolveWarpkeepTitleModel>,
  signal?: AbortSignal
) {
  if (signal?.aborted) return Promise.reject(abortError());
  const request = binaryRequests.get(asset.url) ?? createTitleBinaryRequest(asset);
  request.consumers += 1;
  request.releaseGeneration += 1;
  const acquisitionGeneration = request.releaseGeneration;

  return new Promise<ArrayBuffer>((resolve, reject) => {
    let completed = false;
    const release = () => {
      if (completed) return;
      completed = true;
      signal?.removeEventListener('abort', onAbort);
      request.consumers = Math.max(0, request.consumers - 1);
      if (!request.settled && request.consumers === 0) {
        const releaseGeneration = ++request.releaseGeneration;
        queueMicrotask(() => {
          if (
            !request.settled
            && request.consumers === 0
            && request.releaseGeneration === releaseGeneration
          ) {
            if (binaryRequests.get(asset.url) === request) binaryRequests.delete(asset.url);
            request.controller.abort();
          }
        });
      }
    };
    const onAbort = () => {
      release();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    request.promise.then(
      (bytes) => {
        if (completed) return;
        release();
        resolve(bytes);
      },
      (error) => {
        if (completed) return;
        release();
        reject(error);
      }
    );
    // A StrictMode cleanup/setup pair reacquires synchronously and invalidates
    // the queued zero-consumer abort without starting a duplicate request.
    if (request.releaseGeneration === acquisitionGeneration) return;
  });
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
  const bytes = await acquireTitleBinary(asset, signal);
  if (signal?.aborted) throw abortError();

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
  binaryRequests.forEach((request) => {
    if (!request.settled) request.controller.abort();
  });
  binaryRequests.clear();
}
