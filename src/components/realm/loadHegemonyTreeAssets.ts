import * as THREE from 'three';

import {
  HEGEMONY_TREE_TARGET_VISUAL_HEIGHT,
  hegemonyTreeModel,
  type HegemonyTreeLod,
  type HegemonyTreeRuntimeAsset,
  type HegemonyTreeRuntimeModel
} from './hegemonyTreeRuntimeAssets';
import {
  disposeRealmObject,
  readExactRealmModelResponseBody,
  resolveIntegrityPinnedRealmAssetUrl
} from './loadHegemonyKeep';
import {
  consumeSharedRealmModelRequest,
  throwIfRealmLoadAborted,
  type SharedRealmModelRequest
} from './realmModelRequestLifecycle';

export const DEFAULT_HEGEMONY_TREE_REQUEST_TIMEOUT_MS = 20_000;
// Preserve the original loader export while the immutable catalog becomes the
// single source for the target used by both runtime normalization and planning.
export { HEGEMONY_TREE_TARGET_VISUAL_HEIGHT };
const MAX_HEGEMONY_TREE_REQUEST_TIMEOUT_MS = 60_000;
const TREE_GROUND_CONTACT_LIFT = 0.004;

export type HegemonyTreePrefabPrimitive = Readonly<{
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Matrix relative to the private normalized source root. */
  localMatrixElements: readonly number[];
}>;

export type HegemonyTreePrefab = Readonly<{
  assetId: string;
  lod: HegemonyTreeLod;
  assetUrl: string;
  visualHeight: number;
  footprintDiameter: number;
  primitives: readonly HegemonyTreePrefabPrimitive[];
}>;

export type HegemonyTreePrefabLease = Readonly<{
  prefab: HegemonyTreePrefab;
  /** Idempotent; the final lease frees the parsed local GLB resources. */
  release: () => void;
}>;

export type AcquireHegemonyTreePrefabOptions = Readonly<{
  asset: HegemonyTreeRuntimeAsset;
  lod: HegemonyTreeLod;
  baseUrl: string;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
}>;

type TreeBinaryRequest = SharedRealmModelRequest<ArrayBuffer>;

type CachedTreePrefab = Readonly<{
  prefab: HegemonyTreePrefab;
  sourceRoot: THREE.Group;
}>;

type TreePrefabCacheEntry = {
  leaseCount: number;
  model?: CachedTreePrefab;
  promise: Promise<CachedTreePrefab>;
  releaseAfterLoad: boolean;
};

const binaryRequests = new Map<string, TreeBinaryRequest>();
const prefabCache = new Map<string, TreePrefabCacheEntry>();

function sha256Hex(bytes: ArrayBuffer) {
  return crypto.subtle.digest('SHA-256', bytes).then((digest) => (
    [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  ));
}

function normalizedRequestTimeout(timeoutMs: number | undefined) {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_HEGEMONY_TREE_REQUEST_TIMEOUT_MS;
  return Math.max(1, Math.min(
    MAX_HEGEMONY_TREE_REQUEST_TIMEOUT_MS,
    Math.trunc(timeoutMs ?? DEFAULT_HEGEMONY_TREE_REQUEST_TIMEOUT_MS)
  ));
}

function localPublicAssetPath(model: HegemonyTreeRuntimeModel) {
  // Runtime asset catalogs are repository-relative for verification scripts.
  // The browser receives only this same-origin public path.
  return model.path.replace(/^public\/+/, '');
}

function requestTreeBinary(
  label: string,
  assetUrl: string,
  model: HegemonyTreeRuntimeModel,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined
) {
  const boundedTimeoutMs = normalizedRequestTimeout(timeoutMs);
  const requestKey = [
    label,
    assetUrl,
    model.bytes,
    model.sha256,
    boundedTimeoutMs
  ].join(':');
  const cached = binaryRequests.get(requestKey);
  if (cached) {
    return consumeSharedRealmModelRequest(
      cached,
      signal,
      () => {
        if (binaryRequests.get(requestKey) === cached) binaryRequests.delete(requestKey);
        cached.abortController.abort();
      },
      label
    );
  }

  const abortController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let request: TreeBinaryRequest;
  const fetchRequest = fetch(assetUrl, {
    credentials: 'same-origin',
    redirect: 'error',
    signal: abortController.signal
  }).then(async (response) => {
    if (!response.ok) throw new Error(label + ' request failed with ' + response.status + '.');
    const bytes = await readExactRealmModelResponseBody(response, model.bytes, label);
    if (await sha256Hex(bytes) !== model.sha256) {
      throw new Error(label + ' model failed its integrity check.');
    }
    return bytes;
  });
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(label + ' request timed out after ' + boundedTimeoutMs + 'ms.'));
      abortController.abort();
    }, boundedTimeoutMs);
  });
  const promise = Promise.race([fetchRequest, timeout])
    .finally(() => {
      request.settled = true;
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    })
    .catch((error: unknown) => {
      abortController.abort();
      if (binaryRequests.get(requestKey) === request) binaryRequests.delete(requestKey);
      throw error;
    });
  request = { abortController, consumerCount: 0, promise, settled: false };
  binaryRequests.set(requestKey, request);
  return consumeSharedRealmModelRequest(
    request,
    signal,
    () => {
      if (binaryRequests.get(requestKey) === request) binaryRequests.delete(requestKey);
      abortController.abort();
    },
    label
  );
}

async function parseTreeModel(bytes: ArrayBuffer, resourcePath: string) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js')
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const loaded = await loader.parseAsync(bytes, resourcePath);
  return loaded.scene;
}

function normalizeTreeModel(
  scene: THREE.Object3D,
  asset: HegemonyTreeRuntimeAsset,
  lod: HegemonyTreeLod,
  assetUrl: string
): CachedTreePrefab {
  scene.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const width = Math.max(0.001, bounds.max.x - bounds.min.x);
  const depth = Math.max(0.001, bounds.max.z - bounds.min.z);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  // Source trees are authored around three meters tall while the Realm keep is
  // normalized to a compact board-scale landmark. Keep a private wrapper so
  // source bytes and the trunk-base pivot remain unchanged.
  const normalization = HEGEMONY_TREE_TARGET_VISUAL_HEIGHT / height;
  scene.scale.setScalar(normalization);
  scene.position.set(
    -((bounds.min.x + bounds.max.x) * 0.5) * normalization,
    -bounds.min.y * normalization + TREE_GROUND_CONTACT_LIFT,
    -((bounds.min.z + bounds.max.z) * 0.5) * normalization
  );
  const sourceRoot = new THREE.Group();
  sourceRoot.name = 'hegemony-tree-source-' + asset.id + '-' + lod;
  sourceRoot.add(scene);
  sourceRoot.updateWorldMatrix(true, true);
  const rootInverse = sourceRoot.matrixWorld.clone().invert();
  const primitives: HegemonyTreePrefabPrimitive[] = [];
  sourceRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!material) return;
    const localMatrix = rootInverse.clone().multiply(object.matrixWorld);
    primitives.push(Object.freeze({
      geometry: object.geometry,
      material,
      localMatrixElements: Object.freeze([...localMatrix.elements])
    }));
  });
  if (primitives.length === 0) {
    disposeRealmObject(sourceRoot);
    throw new Error('Hegemony tree ' + asset.id + ' ' + lod + ' contains no renderable meshes.');
  }
  return Object.freeze({
    sourceRoot,
    prefab: Object.freeze({
      assetId: asset.id,
      lod,
      assetUrl,
      visualHeight: height * normalization,
      footprintDiameter: Math.max(width, depth) * normalization,
      primitives: Object.freeze(primitives)
    })
  });
}

async function loadTreePrefab(
  options: AcquireHegemonyTreePrefabOptions
): Promise<CachedTreePrefab> {
  const label = 'Hegemony tree ' + options.asset.id + ' ' + options.lod;
  throwIfRealmLoadAborted(options.signal, label);
  const model = hegemonyTreeModel(options.asset, options.lod);
  const publicPath = localPublicAssetPath(model);
  const assetUrl = resolveIntegrityPinnedRealmAssetUrl(options.baseUrl, publicPath, model.sha256);
  const bytes = await requestTreeBinary(
    label,
    assetUrl,
    model,
    options.requestTimeoutMs,
    options.signal
  );
  throwIfRealmLoadAborted(options.signal, label);
  const scene = await parseTreeModel(
    bytes.slice(0),
    assetUrl.slice(0, assetUrl.lastIndexOf('/') + 1)
  );
  if (options.signal?.aborted) {
    try {
      disposeRealmObject(scene);
    } catch {
      // Cancellation remains the primary outcome.
    }
    throwIfRealmLoadAborted(options.signal, label);
  }
  return normalizeTreeModel(scene, options.asset, options.lod, assetUrl);
}

function cacheKey(options: AcquireHegemonyTreePrefabOptions) {
  const model = hegemonyTreeModel(options.asset, options.lod);
  return [
    options.asset.id,
    options.lod,
    options.baseUrl,
    model.path,
    model.sha256
  ].join(':');
}

function disposeCachedTreePrefab(model: CachedTreePrefab) {
  model.sourceRoot.removeFromParent();
  disposeRealmObject(model.sourceRoot);
}

/**
 * Acquires one parsed, integrity-verified local model per species/quality.
 * Consumers only receive immutable primitive references and must not dispose
 * geometry or materials themselves; the final lease owns source cleanup.
 */
export async function acquireHegemonyTreePrefab(
  options: AcquireHegemonyTreePrefabOptions
): Promise<HegemonyTreePrefabLease> {
  const key = cacheKey(options);
  let entry = prefabCache.get(key);
  if (!entry) {
    const detachedOptions = { ...options, signal: undefined };
    const pending: TreePrefabCacheEntry = {
      leaseCount: 0,
      releaseAfterLoad: false,
      promise: loadTreePrefab(detachedOptions)
    };
    entry = pending;
    prefabCache.set(key, pending);
    pending.promise.then(
      (model) => {
        pending.model = model;
        if (pending.releaseAfterLoad && pending.leaseCount === 0) {
          disposeCachedTreePrefab(model);
          if (prefabCache.get(key) === pending) prefabCache.delete(key);
        }
      },
      () => {
        if (prefabCache.get(key) === pending) prefabCache.delete(key);
      }
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
      disposeCachedTreePrefab(entry!.model);
      if (prefabCache.get(key) === entry) prefabCache.delete(key);
    } else {
      entry!.releaseAfterLoad = true;
    }
  };

  try {
    const label = 'Hegemony tree ' + options.asset.id;
    throwIfRealmLoadAborted(options.signal, label);
    const model = await new Promise<CachedTreePrefab>((resolve, reject) => {
      const signal = options.signal;
      const abort = () => reject(Object.assign(
        new Error(label + ' load was cancelled.'),
        { name: 'AbortError' }
      ));
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
        }
      );
    });
    throwIfRealmLoadAborted(options.signal, label);
    return Object.freeze({ prefab: model.prefab, release });
  } catch (error) {
    release();
    throw error;
  }
}

export function clearHegemonyTreeAssetCachesForTests() {
  binaryRequests.clear();
  for (const entry of prefabCache.values()) {
    if (entry.model) disposeCachedTreePrefab(entry.model);
    else entry.releaseAfterLoad = true;
  }
  prefabCache.clear();
}
