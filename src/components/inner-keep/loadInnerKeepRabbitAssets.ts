import * as THREE from 'three';

import {
  disposeRealmObject,
  readExactRealmModelResponseBody,
  resolveIntegrityPinnedRealmAssetUrl,
  tuneHegemonyModelMaterial,
} from '../realm/loadHegemonyKeep';
import {
  consumeSharedRealmModelRequest,
  throwIfRealmLoadAborted,
  type SharedRealmModelRequest,
} from '../realm/realmModelRequestLifecycle';
import {
  innerKeepRabbitModel,
  type InnerKeepRabbitRuntimeLod,
  type InnerKeepRabbitRuntimeModel,
} from './innerKeepRabbitRuntimeAssets';

export const DEFAULT_INNER_KEEP_RABBIT_REQUEST_TIMEOUT_MS = 20_000;
const MAX_INNER_KEEP_RABBIT_REQUEST_TIMEOUT_MS = 60_000;
const RABBIT_GROUND_CONTACT_LIFT = 0.004;

export type InnerKeepRabbitPrefab = Readonly<{
  lod: InnerKeepRabbitRuntimeLod;
  assetUrl: string;
  sourceRoot: THREE.Group;
  clips: readonly THREE.AnimationClip[];
  boundsMeters: readonly [number, number, number];
  footprintDiameter: number;
  visualHeight: number;
  triangles: number;
  animated: boolean;
  /** Each animated clone owns an independent skeleton and mixer state. */
  clone: () => THREE.Group;
}>;

export type InnerKeepRabbitPrefabLease = Readonly<{
  prefab: InnerKeepRabbitPrefab;
  /** Idempotent; the final lease frees decoded GLB resources. */
  release: () => void;
}>;

export type AcquireInnerKeepRabbitPrefabOptions = Readonly<{
  lod: InnerKeepRabbitRuntimeLod;
  baseUrl: string;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  maxAnisotropy?: number;
}>;

type RabbitBinaryRequest = SharedRealmModelRequest<ArrayBuffer>;
type LoadedRabbit = Readonly<{
  scene: THREE.Group;
  animations: readonly THREE.AnimationClip[];
}>;
type CachedRabbitPrefab = Readonly<{
  prefab: InnerKeepRabbitPrefab;
  sourceRoot: THREE.Group;
}>;
type RabbitPrefabCacheEntry = {
  abortController: AbortController;
  leaseCount: number;
  model?: CachedRabbitPrefab;
  promise: Promise<CachedRabbitPrefab>;
  releaseAfterLoad: boolean;
};

const binaryRequests = new Map<string, RabbitBinaryRequest>();
const prefabCache = new Map<string, RabbitPrefabCacheEntry>();

function sha256Hex(bytes: ArrayBuffer) {
  // Copy into this realm so Web Crypto accepts buffers created by a mocked or
  // embedded response realm as a valid BufferSource.
  const source = new Uint8Array(bytes.byteLength);
  source.set(new Uint8Array(bytes));
  return crypto.subtle.digest('SHA-256', source).then((digest) => (
    [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  ));
}

function normalizedRequestTimeout(timeoutMs: number | undefined) {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_INNER_KEEP_RABBIT_REQUEST_TIMEOUT_MS;
  return Math.max(1, Math.min(
    MAX_INNER_KEEP_RABBIT_REQUEST_TIMEOUT_MS,
    Math.trunc(timeoutMs ?? DEFAULT_INNER_KEEP_RABBIT_REQUEST_TIMEOUT_MS),
  ));
}

function normalizedAnisotropy(value: number | undefined) {
  if (!Number.isFinite(value)) return 4;
  return Math.max(1, Math.min(32, Math.trunc(value!)));
}

function requestRabbitBinary(
  label: string,
  assetUrl: string,
  model: InnerKeepRabbitRuntimeModel,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
) {
  const boundedTimeoutMs = normalizedRequestTimeout(timeoutMs);
  const requestKey = [assetUrl, model.bytes, model.sha256, boundedTimeoutMs].join(':');
  const cached = binaryRequests.get(requestKey);
  if (cached) {
    return consumeSharedRealmModelRequest(cached, signal, () => {
      if (binaryRequests.get(requestKey) === cached) binaryRequests.delete(requestKey);
      cached.abortController.abort();
    }, label);
  }

  const abortController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let request: RabbitBinaryRequest;
  const fetchRequest = fetch(assetUrl, {
    cache: 'force-cache',
    credentials: 'same-origin',
    redirect: 'error',
    signal: abortController.signal,
  }).then(async (response) => {
    if (!response.ok) throw new Error(`${label} request failed with ${response.status}.`);
    const bytes = await readExactRealmModelResponseBody(response, model.bytes, label);
    if (await sha256Hex(bytes) !== model.sha256) {
      throw new Error(`${label} model failed its SHA-256 integrity check.`);
    }
    return bytes;
  });
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} request timed out after ${boundedTimeoutMs}ms.`));
      abortController.abort();
    }, boundedTimeoutMs);
  });
  const promise = Promise.race([fetchRequest, timeout])
    .finally(() => {
      request.settled = true;
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      if (binaryRequests.get(requestKey) === request) binaryRequests.delete(requestKey);
    })
    .catch((error: unknown) => {
      abortController.abort();
      if (binaryRequests.get(requestKey) === request) binaryRequests.delete(requestKey);
      throw error;
    });
  request = { abortController, consumerCount: 0, promise, settled: false };
  binaryRequests.set(requestKey, request);
  return consumeSharedRealmModelRequest(request, signal, () => {
    if (binaryRequests.get(requestKey) === request) binaryRequests.delete(requestKey);
    abortController.abort();
  }, label);
}

let parserPromise: Promise<Readonly<{
  parse: (bytes: ArrayBuffer, resourcePath: string) => Promise<LoadedRabbit>;
  cloneSkinned: (root: THREE.Group) => THREE.Group;
}>> | undefined;

function rabbitParser() {
  parserPromise ??= Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
    import('three/addons/utils/SkeletonUtils.js'),
  ]).then(([{ GLTFLoader }, { MeshoptDecoder }, SkeletonUtils]) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    return Object.freeze({
      parse: async (bytes: ArrayBuffer, resourcePath: string) => {
        const gltf = await loader.parseAsync(bytes, resourcePath);
        return Object.freeze({
          scene: gltf.scene,
          animations: Object.freeze([...gltf.animations]),
        });
      },
      cloneSkinned: (root: THREE.Group) => SkeletonUtils.clone(root) as THREE.Group,
    });
  });
  return parserPromise;
}

function exactClipNames(actual: readonly THREE.AnimationClip[], expected: readonly string[]) {
  const actualNames = actual.map((clip) => clip.name).sort();
  return actualNames.length === expected.length
    && actualNames.every((name, index) => name === [...expected].sort()[index]);
}

function prepareRabbitPrefab(
  loaded: LoadedRabbit,
  lod: InnerKeepRabbitRuntimeLod,
  model: InnerKeepRabbitRuntimeModel,
  assetUrl: string,
  cloneSkinned: (root: THREE.Group) => THREE.Group,
  maxAnisotropy: number,
): CachedRabbitPrefab {
  loaded.scene.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(loaded.scene);
  const size = bounds.getSize(new THREE.Vector3());
  if (
    bounds.isEmpty()
    || ![size.x, size.y, size.z].every(Number.isFinite)
    || Math.max(size.x, size.y, size.z) <= 0.001
  ) {
    disposeRealmObject(loaded.scene);
    throw new Error(`Inner Keep rabbit ${lod} has invalid render bounds.`);
  }
  let skinnedMeshCount = 0;
  loaded.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.SkinnedMesh) skinnedMeshCount += 1;
    object.castShadow = false;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => tuneHegemonyModelMaterial(
      material,
      normalizedAnisotropy(maxAnisotropy),
      'gathering-node',
    ));
  });
  if (
    !exactClipNames(loaded.animations, model.animations)
    || (model.rigged && skinnedMeshCount === 0)
    || (!model.rigged && skinnedMeshCount !== 0)
  ) {
    disposeRealmObject(loaded.scene);
    throw new Error(`Inner Keep rabbit ${lod} does not match its rig and clip catalog.`);
  }

  loaded.scene.position.set(
    -(bounds.min.x + bounds.max.x) * 0.5,
    -bounds.min.y + RABBIT_GROUND_CONTACT_LIFT,
    -(bounds.min.z + bounds.max.z) * 0.5,
  );
  const sourceRoot = new THREE.Group();
  sourceRoot.name = `inner-keep-lowlands-rabbit-source:${lod}`;
  sourceRoot.userData.presentationOnly = true;
  sourceRoot.userData.gameplayAuthority = false;
  sourceRoot.add(loaded.scene);
  sourceRoot.updateWorldMatrix(true, true);

  const boundsMeters = Object.freeze([size.x, size.y, size.z] as const);
  const prefab: InnerKeepRabbitPrefab = Object.freeze({
    lod,
    assetUrl,
    sourceRoot,
    clips: loaded.animations,
    boundsMeters,
    footprintDiameter: Math.max(size.x, size.z),
    visualHeight: size.y,
    triangles: model.triangles,
    animated: model.rigged,
    clone: () => model.rigged
      ? cloneSkinned(sourceRoot)
      : sourceRoot.clone(true),
  });
  return Object.freeze({ prefab, sourceRoot });
}

async function loadRabbitPrefab(
  options: AcquireInnerKeepRabbitPrefabOptions,
): Promise<CachedRabbitPrefab> {
  const label = `Inner Keep Lowlands Rabbit ${options.lod}`;
  throwIfRealmLoadAborted(options.signal, label);
  const model = innerKeepRabbitModel(options.lod);
  const assetUrl = resolveIntegrityPinnedRealmAssetUrl(
    options.baseUrl,
    model.path,
    model.sha256,
  );
  const bytes = await requestRabbitBinary(
    label,
    assetUrl,
    model,
    options.requestTimeoutMs,
    options.signal,
  );
  throwIfRealmLoadAborted(options.signal, label);
  const parser = await rabbitParser();
  const loaded = await parser.parse(
    bytes.slice(0),
    assetUrl.slice(0, assetUrl.lastIndexOf('/') + 1),
  );
  if (options.signal?.aborted) {
    try {
      disposeRealmObject(loaded.scene);
    } catch {
      // Cancellation remains the primary outcome.
    }
    throwIfRealmLoadAborted(options.signal, label);
  }
  return prepareRabbitPrefab(
    loaded,
    options.lod,
    model,
    assetUrl,
    parser.cloneSkinned,
    normalizedAnisotropy(options.maxAnisotropy),
  );
}

function cacheKey(options: AcquireInnerKeepRabbitPrefabOptions) {
  const model = innerKeepRabbitModel(options.lod);
  return [
    options.lod,
    options.baseUrl,
    model.path,
    model.sha256,
    normalizedAnisotropy(options.maxAnisotropy),
  ].join(':');
}

function disposeCachedRabbitPrefab(model: CachedRabbitPrefab) {
  model.sourceRoot.removeFromParent();
  disposeRealmObject(model.sourceRoot);
}

/**
 * Acquires one exact same-origin rabbit prefab per LOD. Pending work is shared,
 * individual callers may abort independently, and the final lease owns GPU
 * resource disposal. Animated clones use SkeletonUtils for isolated rigs.
 */
export async function acquireInnerKeepRabbitPrefab(
  options: AcquireInnerKeepRabbitPrefabOptions,
): Promise<InnerKeepRabbitPrefabLease> {
  const key = cacheKey(options);
  let entry = prefabCache.get(key);
  if (!entry) {
    const abortController = new AbortController();
    const pending: RabbitPrefabCacheEntry = {
      abortController,
      leaseCount: 0,
      releaseAfterLoad: false,
      promise: loadRabbitPrefab({ ...options, signal: abortController.signal }),
    };
    entry = pending;
    prefabCache.set(key, pending);
    pending.promise.then(
      (model) => {
        pending.model = model;
        if (pending.releaseAfterLoad && pending.leaseCount === 0) {
          disposeCachedRabbitPrefab(model);
          if (prefabCache.get(key) === pending) prefabCache.delete(key);
        }
      },
      () => {
        if (prefabCache.get(key) === pending) prefabCache.delete(key);
      },
    );
  }

  entry.leaseCount += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry!.leaseCount = Math.max(0, entry!.leaseCount - 1);
    if (entry!.leaseCount > 0) return;
    if (entry!.model) {
      disposeCachedRabbitPrefab(entry!.model);
      if (prefabCache.get(key) === entry) prefabCache.delete(key);
    } else {
      entry!.releaseAfterLoad = true;
      if (prefabCache.get(key) === entry) prefabCache.delete(key);
      entry!.abortController.abort();
    }
  };

  try {
    const label = `Inner Keep Lowlands Rabbit ${options.lod}`;
    throwIfRealmLoadAborted(options.signal, label);
    const model = await new Promise<CachedRabbitPrefab>((resolve, reject) => {
      const signal = options.signal;
      const abort = () => {
        const error = new Error(`${label} load was cancelled.`);
        error.name = 'AbortError';
        reject(error);
      };
      const cleanupAbort = () => signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      entry!.promise.then(
        (value) => {
          cleanupAbort();
          resolve(value);
        },
        (error: unknown) => {
          cleanupAbort();
          reject(error);
        },
      );
    });
    throwIfRealmLoadAborted(options.signal, label);
    return Object.freeze({ prefab: model.prefab, release });
  } catch (error) {
    release();
    throw error;
  }
}

export function clearInnerKeepRabbitAssetCachesForTests() {
  for (const request of binaryRequests.values()) request.abortController.abort();
  binaryRequests.clear();
  for (const entry of prefabCache.values()) {
    if (entry.model) disposeCachedRabbitPrefab(entry.model);
    else {
      entry.releaseAfterLoad = true;
      entry.abortController.abort();
    }
  }
  prefabCache.clear();
}

export function innerKeepRabbitAssetCacheSizesForTests() {
  return Object.freeze({
    binaryRequests: binaryRequests.size,
    prefabs: prefabCache.size,
  });
}
