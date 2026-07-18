import * as THREE from 'three';

import {
  disposeRealmObject,
  readExactRealmModelResponseBody,
  resolveIntegrityPinnedRealmAssetUrl,
  tuneHegemonyModelMaterial,
  type HegemonyModelMaterialRole
} from './loadHegemonyKeep';
import {
  consumeSharedRealmModelRequest,
  throwIfRealmLoadAborted,
  type SharedRealmModelRequest
} from './realmModelRequestLifecycle';

export const HEGEMONY_EXPEDITION_LODS = Object.freeze([
  'high',
  'balanced',
  'compact'
] as const);

export type HegemonyExpeditionLod = typeof HEGEMONY_EXPEDITION_LODS[number];

export type HegemonyExpeditionRuntimeAsset = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type HegemonyExpeditionRuntimeAssetFamily = Readonly<Record<
  HegemonyExpeditionLod,
  HegemonyExpeditionRuntimeAsset
>>;

/**
 * Public, immutable assets only. The candidate Gold Mine GLBs remain outside
 * this family and cannot be requested by the Realm renderer.
 */
export const HEGEMONY_GOLD_MINE_RUNTIME_ASSETS: HegemonyExpeditionRuntimeAssetFamily =
  Object.freeze({
    high: Object.freeze({
      path: 'models/hegemony/gathering-nodes/gold-mine/hegemony-gold-mine-high-6c3731e0f3381014.glb',
      bytes: 263_528,
      sha256: '6c3731e0f3381014d661d539c25f67e4f79f894b721d1feac9e275b07b8a6ab3'
    }),
    balanced: Object.freeze({
      path: 'models/hegemony/gathering-nodes/gold-mine/hegemony-gold-mine-balanced-96a467baaf1dfba4.glb',
      bytes: 154_380,
      sha256: '96a467baaf1dfba44d9c21e2ceb18348b564e3cdfe7daffb6d6bcd209634af42'
    }),
    compact: Object.freeze({
      path: 'models/hegemony/gathering-nodes/gold-mine/hegemony-gold-mine-compact-d2644366898cf610.glb',
      bytes: 95_016,
      sha256: 'd2644366898cf610c9824761ff01fb43346d9db92a8a13be0569b3d49557dd6f'
    })
  });

export const HEGEMONY_SUPPLY_WAGON_RUNTIME_ASSETS: HegemonyExpeditionRuntimeAssetFamily =
  Object.freeze({
    high: Object.freeze({
      path: 'models/hegemony/hegemony-supply-wagon-high-4a0f762b9dadeadd.glb',
      bytes: 1_637_452,
      sha256: '4a0f762b9dadeaddd8b2d528a7e165eaa98a8dd4134eb924604922524e7bbc5d'
    }),
    balanced: Object.freeze({
      path: 'models/hegemony/hegemony-supply-wagon-balanced-af0f8788eaaf9a32.glb',
      bytes: 752_364,
      sha256: 'af0f8788eaaf9a32e9fd8d17e9ab897a9036d0cc7161a318afa0af3556c6e3b2'
    }),
    compact: Object.freeze({
      path: 'models/hegemony/hegemony-supply-wagon-compact-fefb5105b95d43b4.glb',
      bytes: 452_676,
      sha256: 'fefb5105b95d43b411571000e8ae3fd78460eaa5f490eaeb63f90e5d84aba6ca'
    })
  });

export const DEFAULT_HEGEMONY_EXPEDITION_REQUEST_TIMEOUT_MS = 20_000;
const MAX_HEGEMONY_EXPEDITION_REQUEST_TIMEOUT_MS = 60_000;

type ExpeditionBinaryRequest = SharedRealmModelRequest<ArrayBuffer>;
const binaryRequests = new Map<string, ExpeditionBinaryRequest>();

type ExpeditionPrefabCacheEntry = {
  leaseCount: number;
  model?: HegemonyExpeditionModel;
  promise: Promise<HegemonyExpeditionModel>;
  releaseAfterLoad: boolean;
};
const prefabCache = new Map<string, ExpeditionPrefabCacheEntry>();

export type HegemonyExpeditionModel = Readonly<{
  root: THREE.Group;
  clips: readonly THREE.AnimationClip[];
  footprintDiameter: number;
  visualHeight: number;
  assetUrl: string;
}>;

export type HegemonyExpeditionPrefabLease = Readonly<{
  model: HegemonyExpeditionModel;
  /** Idempotent; the final lease releases decoded GLB GPU/browser resources. */
  release: () => void;
}>;

export type LoadHegemonyExpeditionModelOptions = Readonly<{
  label: string;
  asset: HegemonyExpeditionRuntimeAsset;
  materialRole: Extract<HegemonyModelMaterialRole, 'gathering-node' | 'wagon'>;
  baseUrl: string;
  targetFootprintDiameter: number;
  dynamicShadows: boolean;
  maxAnisotropy: number;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
}>;

function sha256Hex(bytes: ArrayBuffer) {
  return crypto.subtle.digest('SHA-256', bytes).then((digest) => (
    [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  ));
}

function normalizedRequestTimeout(timeoutMs: number | undefined) {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_HEGEMONY_EXPEDITION_REQUEST_TIMEOUT_MS;
  return Math.max(1, Math.min(
    MAX_HEGEMONY_EXPEDITION_REQUEST_TIMEOUT_MS,
    Math.trunc(timeoutMs ?? DEFAULT_HEGEMONY_EXPEDITION_REQUEST_TIMEOUT_MS)
  ));
}

function requestAssetBinary(
  label: string,
  assetUrl: string,
  asset: HegemonyExpeditionRuntimeAsset,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined
) {
  const boundedTimeoutMs = normalizedRequestTimeout(timeoutMs);
  const requestKey = `${label}:${boundedTimeoutMs}:${assetUrl}`;
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
  let request: ExpeditionBinaryRequest;
  const fetchRequest = fetch(assetUrl, {
    credentials: 'same-origin',
    redirect: 'error',
    signal: abortController.signal
  }).then(async (response) => {
    if (!response.ok) throw new Error(`${label} request failed with ${response.status}.`);
    const bytes = await readExactRealmModelResponseBody(response, asset.bytes, label);
    if (await sha256Hex(bytes) !== asset.sha256) {
      throw new Error(`${label} model failed its integrity check.`);
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

async function parseHegemonyExpeditionModel(bytes: ArrayBuffer, resourcePath: string) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js')
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const loaded = await loader.parseAsync(bytes, resourcePath);
  return Object.freeze({ scene: loaded.scene, clips: Object.freeze([...loaded.animations]) });
}

/**
 * The immutable source remains untouched. A private wrapper centers and
 * grounds each decoded clone, which avoids relying on a source-scene origin
 * that differs between the wagon and Gold Mine exports.
 */
function prepareHegemonyExpeditionModel(
  scene: THREE.Object3D,
  options: Pick<LoadHegemonyExpeditionModelOptions,
    'dynamicShadows' | 'label' | 'materialRole' | 'maxAnisotropy' | 'targetFootprintDiameter'
  >
) {
  scene.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const width = Math.max(0.001, bounds.max.x - bounds.min.x);
  const depth = Math.max(0.001, bounds.max.z - bounds.min.z);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const targetFootprintDiameter = Number.isFinite(options.targetFootprintDiameter)
    ? Math.max(0.001, options.targetFootprintDiameter)
    : 1;
  const scale = targetFootprintDiameter / Math.max(width, depth);
  const maxAnisotropy = Number.isFinite(options.maxAnisotropy)
    ? Math.max(1, options.maxAnisotropy)
    : 1;
  scene.scale.setScalar(scale);
  scene.position.set(
    -((bounds.min.x + bounds.max.x) * 0.5) * scale,
    -bounds.min.y * scale,
    -((bounds.min.z + bounds.max.z) * 0.5) * scale
  );
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = options.dynamicShadows;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => tuneHegemonyModelMaterial(
      material,
      maxAnisotropy,
      options.materialRole
    ));
  });
  const root = new THREE.Group();
  root.name = options.label;
  root.add(scene);
  return Object.freeze({
    root,
    footprintDiameter: Math.max(width, depth) * scale,
    visualHeight: height * scale
  });
}

export async function loadHegemonyExpeditionModel(
  options: LoadHegemonyExpeditionModelOptions
): Promise<HegemonyExpeditionModel> {
  throwIfRealmLoadAborted(options.signal, options.label);
  const assetUrl = resolveIntegrityPinnedRealmAssetUrl(
    options.baseUrl,
    options.asset.path,
    options.asset.sha256
  );
  const bytes = await requestAssetBinary(
    options.label,
    assetUrl,
    options.asset,
    options.requestTimeoutMs,
    options.signal
  );
  throwIfRealmLoadAborted(options.signal, options.label);
  const loaded = await parseHegemonyExpeditionModel(
    bytes.slice(0),
    assetUrl.slice(0, assetUrl.lastIndexOf('/') + 1)
  );
  if (options.signal?.aborted) {
    try {
      disposeRealmObject(loaded.scene);
    } catch {
      // Cancellation is primary; best-effort GPU release cannot supersede it.
    }
    throwIfRealmLoadAborted(options.signal, options.label);
  }
  const prepared = prepareHegemonyExpeditionModel(loaded.scene, options);
  return Object.freeze({ ...prepared, clips: loaded.clips, assetUrl });
}

function prefabCacheKey(options: LoadHegemonyExpeditionModelOptions) {
  return [
    options.asset.path,
    options.asset.sha256,
    options.baseUrl,
    options.materialRole,
    options.targetFootprintDiameter,
    options.dynamicShadows,
    Math.max(1, Math.trunc(options.maxAnisotropy))
  ].join(':');
}

/**
 * A realm-lifetime parsed-prefab lease. Bytes are already coalesced below;
 * this additionally keeps each GLB parse, texture decode, and source mesh
 * family shared across scene recreation and many visual clones.
 */
export async function acquireHegemonyExpeditionPrefab(
  options: LoadHegemonyExpeditionModelOptions
): Promise<HegemonyExpeditionPrefabLease> {
  const key = prefabCacheKey(options);
  let entry = prefabCache.get(key);
  if (!entry) {
    const detachedOptions = { ...options, signal: undefined };
    const pending: ExpeditionPrefabCacheEntry = {
      leaseCount: 0,
      releaseAfterLoad: false,
      promise: loadHegemonyExpeditionModel(detachedOptions)
    };
    entry = pending;
    prefabCache.set(key, pending);
    pending.promise.then(
      (model) => {
        pending.model = model;
        if (pending.releaseAfterLoad && pending.leaseCount === 0) {
          disposeHegemonyExpeditionModel(model);
          if (prefabCache.get(key) === pending) prefabCache.delete(key);
        }
      },
      () => {
        if (prefabCache.get(key) === pending) prefabCache.delete(key);
      }
    );
  }

  // Reserve before awaiting. Otherwise a first scene can release its lease
  // while a second scene is still awaiting the same parse, disposing the
  // prefab just before the second scene receives it.
  entry.leaseCount += 1;
  let released = false;
  const releaseReservation = () => {
    if (released) return;
    released = true;
    entry!.leaseCount = Math.max(0, entry!.leaseCount - 1);
    if (entry!.leaseCount > 0) return;
    if (entry!.model) {
      disposeHegemonyExpeditionModel(entry!.model);
      if (prefabCache.get(key) === entry) prefabCache.delete(key);
    } else {
      entry!.releaseAfterLoad = true;
    }
  };

  try {
    throwIfRealmLoadAborted(options.signal, options.label);
    const model = await new Promise<HegemonyExpeditionModel>((resolve, reject) => {
      const signal = options.signal;
      const abort = () => reject(Object.assign(
        new Error(`${options.label} load was cancelled.`),
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
    throwIfRealmLoadAborted(options.signal, options.label);
    return Object.freeze({
      model,
      release: releaseReservation
    });
  } catch (error) {
    releaseReservation();
    throw error;
  }
}

export function clearHegemonyExpeditionAssetBinaryCacheForTests() {
  binaryRequests.clear();
}

export function clearHegemonyExpeditionPrefabCacheForTests() {
  for (const entry of prefabCache.values()) {
    if (entry.model) disposeHegemonyExpeditionModel(entry.model);
    else entry.releaseAfterLoad = true;
  }
  prefabCache.clear();
}

export function disposeHegemonyExpeditionModel(model: HegemonyExpeditionModel) {
  model.root.removeFromParent();
  disposeRealmObject(model.root);
}
