import * as THREE from 'three';

import {
  disposeRealmObject,
  readExactRealmModelResponseBody,
  resolveIntegrityPinnedRealmAssetUrl,
  tuneHegemonyModelMaterial,
} from '../realm/loadHegemonyKeep';
import {
  INNER_KEEP_POPULATION_RUNTIME_ACTORS,
  INNER_KEEP_STATIC_RUNTIME_ASSETS,
  type InnerKeepPopulationRuntimeActor,
  type InnerKeepPopulationRuntimeProfile,
  type InnerKeepRuntimeModel,
  type InnerKeepStaticRuntimeAsset,
  type InnerKeepStaticRuntimeProfile,
} from './innerKeepRuntimeAssetCatalog.generated';
import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';

export const INNER_KEEP_RUNTIME_REQUEST_TIMEOUT_MS = 20_000;
export const INNER_KEEP_RUNTIME_REQUEST_CONCURRENCY = 6;
export const INNER_KEEP_RUNTIME_REQUEST_ATTEMPTS = 2;

export type InnerKeepRuntimePrefab = Readonly<{
  id: string;
  root: THREE.Group;
  clips: readonly THREE.AnimationClip[];
  boundsMeters: readonly [number, number, number];
  triangles: number;
  drawCalls: number;
  animated: boolean;
  mounted: boolean;
  clone: () => THREE.Group;
}>;

export type InnerKeepRuntimeAssetFailure = Readonly<{
  kind: 'static' | 'population';
  id: string;
  reason: string;
}>;

export type InnerKeepRuntimeAssetBundle = Readonly<{
  staticPrefabs: ReadonlyMap<string, InnerKeepRuntimePrefab>;
  populationPrefabs: ReadonlyMap<string, InnerKeepRuntimePrefab>;
  failures: readonly InnerKeepRuntimeAssetFailure[];
  dispose: () => void;
}>;

export type LoadInnerKeepRuntimeAssetBundleOptions = Readonly<{
  quality: InnerKeepSceneQuality;
  reducedMotion: boolean;
  baseUrl: string;
  staticAssetIds: readonly string[];
  populationActorIds: readonly string[];
  maxAnisotropy?: number;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  concurrency?: number;
  fetcher?: typeof fetch;
}>;

type LoadedGlb = Readonly<{
  scene: THREE.Group;
  animations: readonly THREE.AnimationClip[];
}>;

function abortError(label: string) {
  return new DOMException(`${label} loading was cancelled.`, 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined, label: string) {
  if (signal?.aborted) throw abortError(label);
}

function normalizedTimeout(value: number | undefined) {
  if (!Number.isFinite(value)) return INNER_KEEP_RUNTIME_REQUEST_TIMEOUT_MS;
  return Math.max(1, Math.min(60_000, Math.trunc(value!)));
}

function normalizedConcurrency(value: number | undefined) {
  if (!Number.isFinite(value)) return INNER_KEEP_RUNTIME_REQUEST_CONCURRENCY;
  return Math.max(1, Math.min(8, Math.trunc(value!)));
}

class RetryableRuntimeAssetRequestError extends Error {}

async function sha256Hex(bytes: ArrayBuffer) {
  // Some browser/test realms brand ArrayBuffer independently. Hash a fresh
  // view from this module's realm so Web Crypto always receives BufferSource.
  const source = new Uint8Array(bytes.byteLength);
  source.set(new Uint8Array(bytes));
  const digest = await crypto.subtle.digest('SHA-256', source);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function requestExactModel(
  label: string,
  model: InnerKeepRuntimeModel,
  options: Pick<LoadInnerKeepRuntimeAssetBundleOptions,
    'baseUrl' | 'fetcher' | 'requestTimeoutMs' | 'signal'
  >,
) {
  const assetUrl = resolveIntegrityPinnedRealmAssetUrl(
    options.baseUrl,
    model.path,
    model.sha256,
  );
  const timeoutMs = normalizedTimeout(options.requestTimeoutMs);
  let lastError: unknown;
  for (let attempt = 1; attempt <= INNER_KEEP_RUNTIME_REQUEST_ATTEMPTS; attempt += 1) {
    throwIfAborted(options.signal, label);
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', forwardAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
    let phase: 'request' | 'body' | 'integrity' = 'request';
    let response: Response | undefined;
    try {
      response = await (options.fetcher ?? fetch)(assetUrl, {
        cache: 'force-cache',
        credentials: 'same-origin',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = `${label} request failed with ${response.status}.`;
        if (response.status === 408 || response.status === 429 || response.status >= 500) {
          throw new RetryableRuntimeAssetRequestError(detail);
        }
        throw new Error(detail);
      }
      phase = 'body';
      const bytes = await readExactRealmModelResponseBody(response, model.bytes, label);
      throwIfAborted(options.signal, label);
      if (controller.signal.aborted) {
        throw new RetryableRuntimeAssetRequestError(
          `${label} request timed out after ${timeoutMs}ms.`,
        );
      }
      phase = 'integrity';
      if (await sha256Hex(bytes) !== model.sha256) {
        throw new Error(`${label} failed its SHA-256 integrity check.`);
      }
      throwIfAborted(options.signal, label);
      if (controller.signal.aborted) {
        throw new RetryableRuntimeAssetRequestError(
          `${label} request timed out after ${timeoutMs}ms.`,
        );
      }
      return Object.freeze({ bytes, assetUrl });
    } catch (error) {
      if (options.signal?.aborted) throw abortError(label);
      if (controller.signal.aborted) {
        lastError = new RetryableRuntimeAssetRequestError(
          `${label} request timed out after ${timeoutMs}ms.`,
        );
      } else if (error instanceof RetryableRuntimeAssetRequestError) {
        lastError = error;
      } else if (phase !== 'integrity' && error instanceof TypeError) {
        lastError = new RetryableRuntimeAssetRequestError(
          `${label} request failed (${error.message || 'network error'}).`,
        );
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', forwardAbort);
      // Retire every attempt, including successful reads and responses rejected
      // from headers alone. This prevents an unread 4xx/5xx body from remaining
      // in flight while a retry occupies another bounded queue slot.
      controller.abort();
      if (response?.body && !response.body.locked) {
        try {
          await response.body.cancel();
        } catch {
          // Transport cleanup must not replace the request or integrity result.
        }
      }
    }
    if (attempt === INNER_KEEP_RUNTIME_REQUEST_ATTEMPTS) throw lastError;
  }
  throw lastError;
}

let parserPromise: Promise<Readonly<{
  parse: (bytes: ArrayBuffer, resourcePath: string) => Promise<LoadedGlb>;
  cloneSkinned: (root: THREE.Group) => THREE.Group;
}>> | undefined;

function runtimeParser() {
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

function finiteBounds(root: THREE.Object3D, label: string) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  if (
    bounds.isEmpty()
    || ![size.x, size.y, size.z].every(Number.isFinite)
    || Math.max(size.x, size.y, size.z) <= 0.001
  ) throw new Error(`${label} has invalid render bounds.`);
  return Object.freeze({ bounds, size });
}

function prepareSourceRoot(
  label: string,
  loaded: LoadedGlb,
  options: Readonly<{
    animated: boolean;
    dynamicShadows: boolean;
    maxAnisotropy: number;
  }>,
) {
  const { bounds, size } = finiteBounds(loaded.scene, label);
  loaded.scene.position.set(
    -(bounds.min.x + bounds.max.x) * 0.5,
    -bounds.min.y,
    -(bounds.min.z + bounds.max.z) * 0.5,
  );
  loaded.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = options.dynamicShadows;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => tuneHegemonyModelMaterial(
      material,
      options.maxAnisotropy,
      'gathering-node',
    ));
  });
  const root = new THREE.Group();
  root.name = `inner-keep-runtime-source:${label}`;
  root.add(loaded.scene);
  return Object.freeze({
    root,
    measuredBounds: Object.freeze([size.x, size.y, size.z] as const),
    clips: loaded.animations,
    animated: options.animated,
  });
}

function staticProfileForQuality(quality: InnerKeepSceneQuality): InnerKeepStaticRuntimeProfile {
  return quality === 'reduced' ? 'compact' : quality;
}

function populationProfileForQuality(
  quality: InnerKeepSceneQuality,
  reducedMotion: boolean,
): InnerKeepPopulationRuntimeProfile {
  return quality === 'reduced' || reducedMotion ? 'compact' : 'balanced';
}

async function loadStaticPrefab(
  asset: InnerKeepStaticRuntimeAsset,
  profile: InnerKeepStaticRuntimeProfile,
  options: LoadInnerKeepRuntimeAssetBundleOptions,
) {
  const model = asset.models[profile];
  const label = `Inner Keep ${asset.displayName} ${profile}`;
  const requested = await requestExactModel(label, model, options);
  const parser = await runtimeParser();
  throwIfAborted(options.signal, label);
  const loaded = await parser.parse(
    requested.bytes.slice(0),
    requested.assetUrl.slice(0, requested.assetUrl.lastIndexOf('/') + 1),
  );
  let prepared: ReturnType<typeof prepareSourceRoot> | undefined;
  try {
    throwIfAborted(options.signal, label);
    prepared = prepareSourceRoot(label, loaded, {
      animated: false,
      dynamicShadows: options.quality === 'high',
      maxAnisotropy: Math.max(1, options.maxAnisotropy ?? 4),
    });
    throwIfAborted(options.signal, label);
  } catch (error) {
    disposeRealmObject(prepared?.root ?? loaded.scene);
    throw error;
  }
  return Object.freeze({
    id: asset.id,
    root: prepared.root,
    clips: Object.freeze([]),
    boundsMeters: prepared.measuredBounds,
    triangles: model.triangles,
    drawCalls: model.drawCalls,
    animated: false,
    mounted: false,
    clone: () => prepared.root.clone(true),
  }) satisfies InnerKeepRuntimePrefab;
}

async function loadPopulationPrefab(
  actor: InnerKeepPopulationRuntimeActor,
  profile: InnerKeepPopulationRuntimeProfile,
  options: LoadInnerKeepRuntimeAssetBundleOptions,
) {
  const model = actor.models[profile];
  const label = `Inner Keep ${actor.displayName} ${profile}`;
  const requested = await requestExactModel(label, model, options);
  const parser = await runtimeParser();
  throwIfAborted(options.signal, label);
  const loaded = await parser.parse(
    requested.bytes.slice(0),
    requested.assetUrl.slice(0, requested.assetUrl.lastIndexOf('/') + 1),
  );
  const animated = profile === 'balanced' && model.mode === 'animated';
  let prepared: ReturnType<typeof prepareSourceRoot> | undefined;
  try {
    throwIfAborted(options.signal, label);
    const actualClipNames = new Set(loaded.animations.map((clip) => clip.name));
    if (
      animated
      && model.animations.some((clipName) => !actualClipNames.has(clipName))
    ) throw new Error(`${label} is missing an attested animation clip.`);
    if (!animated && loaded.animations.length !== 0) {
      throw new Error(`${label} static fallback unexpectedly contains animation.`);
    }
    prepared = prepareSourceRoot(label, loaded, {
      animated,
      dynamicShadows: options.quality === 'high',
      maxAnisotropy: Math.max(1, options.maxAnisotropy ?? 4),
    });
    throwIfAborted(options.signal, label);
  } catch (error) {
    disposeRealmObject(prepared?.root ?? loaded.scene);
    throw error;
  }
  return Object.freeze({
    id: actor.id,
    root: prepared.root,
    clips: prepared.clips,
    boundsMeters: prepared.measuredBounds,
    triangles: model.triangles,
    drawCalls: model.drawCalls,
    animated,
    mounted: actor.mounted,
    clone: () => animated
      ? parser.cloneSkinned(prepared.root)
      : prepared.root.clone(true),
  }) satisfies InnerKeepRuntimePrefab;
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const output = new Array<R>(values.length);
  let cursor = 0;
  let halted = false;
  const fatalErrors: Array<Readonly<{ index: number; error: unknown }>> = [];
  const worker = async () => {
    while (!halted && cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        output[index] = await mapper(values[index]!);
      } catch (error) {
        fatalErrors.push(Object.freeze({ index, error }));
        halted = true;
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, Math.max(1, values.length)) },
    worker,
  ));
  if (fatalErrors.length > 0) {
    fatalErrors.sort((left, right) => left.index - right.index);
    throw fatalErrors[0]!.error;
  }
  return output;
}

function disposeRuntimeSources(sources: Set<THREE.Group>) {
  sources.forEach((root) => {
    root.removeFromParent();
    disposeRealmObject(root);
  });
  sources.clear();
}

function failureReason(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return 'Unknown model load failure.';
}

/**
 * Loads only exact, locally installed, content-addressed files. A failed model
 * is reported individually so the scene can retain its procedural fail-safe.
 * Nothing in this catalog owns movement, collision, resources, or gameplay.
 */
export async function loadInnerKeepRuntimeAssetBundle(
  options: LoadInnerKeepRuntimeAssetBundleOptions,
): Promise<InnerKeepRuntimeAssetBundle> {
  throwIfAborted(options.signal, 'Inner Keep assets');
  const staticById = new Map(INNER_KEEP_STATIC_RUNTIME_ASSETS.map((asset) => [asset.id, asset]));
  const populationById = new Map(
    INNER_KEEP_POPULATION_RUNTIME_ACTORS.map((actor) => [actor.id, actor]),
  );
  const selectedStatic = [...new Set(options.staticAssetIds)].map((id) => {
    const asset = staticById.get(id);
    if (!asset) throw new Error(`Unknown Inner Keep static asset ${id}.`);
    return asset;
  });
  const selectedPopulation = [...new Set(options.populationActorIds)].map((id) => {
    const actor = populationById.get(id);
    if (!actor) throw new Error(`Unknown Inner Keep population actor ${id}.`);
    return actor;
  });
  const staticProfile = staticProfileForQuality(options.quality);
  const populationProfile = populationProfileForQuality(
    options.quality,
    options.reducedMotion,
  );
  const sources = new Set<THREE.Group>();
  const concurrency = normalizedConcurrency(options.concurrency);
  const jobs = [
    ...selectedStatic.map((asset) => Object.freeze({
      kind: 'static' as const,
      id: asset.id,
      load: () => loadStaticPrefab(asset, staticProfile, options),
    })),
    ...selectedPopulation.map((actor) => Object.freeze({
      kind: 'population' as const,
      id: actor.id,
      load: () => loadPopulationPrefab(actor, populationProfile, options),
    })),
  ];
  try {
    const results = await mapConcurrent(jobs, concurrency, async (job) => {
      try {
        const prefab = await job.load();
        sources.add(prefab.root);
        return Object.freeze({ kind: job.kind, prefab, failure: null });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        return Object.freeze({
          kind: job.kind,
          prefab: null,
          failure: Object.freeze({
          kind: job.kind,
          id: job.id,
          reason: failureReason(error),
          }),
        });
      }
    });
    throwIfAborted(options.signal, 'Inner Keep assets');
    let disposed = false;
    return Object.freeze({
      staticPrefabs: new Map(results.flatMap((result) => (
        result.kind === 'static' && result.prefab
          ? [[result.prefab.id, result.prefab] as const]
          : []
      ))),
      populationPrefabs: new Map(results.flatMap((result) => (
        result.kind === 'population' && result.prefab
          ? [[result.prefab.id, result.prefab] as const]
          : []
      ))),
      failures: Object.freeze(results.flatMap((result) => (
        result.failure ? [result.failure] : []
      ))),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        disposeRuntimeSources(sources);
      },
    });
  } catch (error) {
    disposeRuntimeSources(sources);
    throw error;
  }
}
