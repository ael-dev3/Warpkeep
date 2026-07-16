import * as THREE from 'three';

import { HEGEMONY_MAIN_CASTLE } from '../../game/map/hegemonyLandmarks';
import type { RealmQuality, RealmQualitySpec } from './realmQuality';
import {
  DEFAULT_HEGEMONY_KEEP_REQUEST_TIMEOUT_MS,
  disposeRealmObject,
  parseHegemonyModel,
  readExactRealmModelResponseBody,
  resolveIntegrityPinnedRealmAssetUrl,
  tuneHegemonyModelMaterial,
  type HegemonyKeepParser
} from './loadHegemonyKeep';
import {
  consumeSharedRealmModelRequest,
  throwIfRealmLoadAborted,
  type SharedRealmModelRequest
} from './realmModelRequestLifecycle';

const MAX_HEGEMONY_LANDSCAPE_BASE_REQUEST_TIMEOUT_MS = 60_000;

export const HEGEMONY_LANDSCAPE_BASE_RUNTIME_ASSETS = Object.freeze({
  high: Object.freeze({
    path: HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.high,
    bytes: 214_372,
    sha256: 'be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c'
  }),
  balanced: Object.freeze({
    path: HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.balanced,
    bytes: 92_784,
    sha256: '179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f'
  }),
  reduced: Object.freeze({
    path: HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.compact,
    bytes: 27_328,
    sha256: 'f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3'
  })
});

type LandscapeBaseRuntimeAsset = (
  typeof HEGEMONY_LANDSCAPE_BASE_RUNTIME_ASSETS
)[keyof typeof HEGEMONY_LANDSCAPE_BASE_RUNTIME_ASSETS];

type LandscapeBaseBinaryRequest = SharedRealmModelRequest<ArrayBuffer>;
const landscapeBaseBinaryRequests = new Map<string, LandscapeBaseBinaryRequest>();

export type HegemonyLandscapeBaseLoadResult = Readonly<{
  root: THREE.Object3D;
  assetUrl: string;
}>;

export type LoadHegemonyLandscapeBaseOptions = Readonly<{
  quality: RealmQualitySpec;
  baseUrl: string;
  maxAnisotropy: number;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  parser?: HegemonyKeepParser;
}>;

export function landscapeBaseAssetPathForQuality(quality: RealmQuality) {
  if (quality === 'high') return HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.high;
  if (quality === 'balanced') {
    return HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.balanced;
  }
  return HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.compact;
}

function landscapeBaseRuntimeAssetForPath(path: string): LandscapeBaseRuntimeAsset {
  const asset = Object.values(HEGEMONY_LANDSCAPE_BASE_RUNTIME_ASSETS)
    .find((candidate) => candidate.path === path);
  if (!asset) throw new Error('Unsupported Hegemony landscape-base runtime asset.');
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
    MAX_HEGEMONY_LANDSCAPE_BASE_REQUEST_TIMEOUT_MS,
    Math.trunc(timeoutMs ?? DEFAULT_HEGEMONY_KEEP_REQUEST_TIMEOUT_MS)
  ));
}

function requestLandscapeBaseBinary(
  assetUrl: string,
  asset: LandscapeBaseRuntimeAsset,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined
) {
  const boundedTimeoutMs = normalizedRequestTimeout(timeoutMs);
  const requestKey = `${boundedTimeoutMs}:${assetUrl}`;
  const cached = landscapeBaseBinaryRequests.get(requestKey);
  if (cached) {
    return consumeSharedRealmModelRequest(
      cached,
      signal,
      () => {
        if (landscapeBaseBinaryRequests.get(requestKey) === cached) {
          landscapeBaseBinaryRequests.delete(requestKey);
        }
        cached.abortController.abort();
      },
      'Hegemony landscape base'
    );
  }

  const abortController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const fetchRequest = Promise.resolve()
    .then(() => fetch(assetUrl, {
      credentials: 'same-origin',
      redirect: 'error',
      signal: abortController.signal
    }))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Hegemony landscape-base request failed with ${response.status}.`);
      }
      const bytes = await readExactRealmModelResponseBody(
        response,
        asset.bytes,
        'Hegemony landscape base'
      );
      if (await sha256Hex(bytes) !== asset.sha256) {
        throw new Error('Hegemony landscape-base model failed its integrity check.');
      }
      return bytes;
    });
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(
        `Hegemony landscape-base request timed out after ${boundedTimeoutMs}ms.`
      ));
      abortController.abort();
    }, boundedTimeoutMs);
  });
  let request: LandscapeBaseBinaryRequest;
  const promise = Promise.race([fetchRequest, timeout])
    .finally(() => {
      request.settled = true;
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    })
    .catch((error) => {
      if (landscapeBaseBinaryRequests.get(requestKey) === request) {
        landscapeBaseBinaryRequests.delete(requestKey);
      }
      throw error;
    });
  request = { abortController, consumerCount: 0, promise, settled: false };
  landscapeBaseBinaryRequests.set(requestKey, request);
  return consumeSharedRealmModelRequest(
    request,
    signal,
    () => {
      if (landscapeBaseBinaryRequests.get(requestKey) === request) {
        landscapeBaseBinaryRequests.delete(requestKey);
      }
      abortController.abort();
    },
    'Hegemony landscape base'
  );
}

export function prepareHegemonyLandscapeBaseScene(
  scene: THREE.Object3D,
  castleTransform: THREE.Object3D,
  options: Readonly<{ dynamicShadows: boolean; maxAnisotropy: number }>
) {
  const scale = castleTransform.scale;
  if (
    ![scale.x, scale.y, scale.z].every((value) => Number.isFinite(value) && value > 0)
    || Math.abs(scale.x - scale.y) > 1e-8
    || Math.abs(scale.x - scale.z) > 1e-8
  ) {
    throw new Error('Hegemony castle normalization must be a finite uniform transform.');
  }
  scene.position.copy(castleTransform.position);
  scene.quaternion.copy(castleTransform.quaternion);
  scene.scale.copy(castleTransform.scale);
  scene.updateMatrix();
  const maxAnisotropy = Number.isFinite(options.maxAnisotropy)
    ? Math.max(1, options.maxAnisotropy)
    : 1;
  let meshCount = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshCount += 1;
    object.userData.warpkeepPrefabRole = 'landscape-base';
    object.castShadow = options.dynamicShadows;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => tuneHegemonyModelMaterial(material, maxAnisotropy));
  });
  if (meshCount === 0) {
    throw new Error('Hegemony landscape-base model contains no renderable meshes.');
  }
  return scene;
}

export async function loadHegemonyLandscapeBase(
  options: LoadHegemonyLandscapeBaseOptions
): Promise<HegemonyLandscapeBaseLoadResult> {
  throwIfRealmLoadAborted(options.signal, 'Hegemony landscape base');
  const asset = landscapeBaseRuntimeAssetForPath(options.quality.landscapeBaseAssetPath);
  const assetUrl = resolveIntegrityPinnedRealmAssetUrl(
    options.baseUrl,
    asset.path,
    asset.sha256
  );
  const bytes = await requestLandscapeBaseBinary(
    assetUrl,
    asset,
    options.requestTimeoutMs,
    options.signal
  );
  throwIfRealmLoadAborted(options.signal, 'Hegemony landscape base');
  const root = await (options.parser ?? parseHegemonyModel)(
    bytes.slice(0),
    assetUrl.slice(0, assetUrl.lastIndexOf('/') + 1)
  );
  if (options.signal?.aborted) {
    try {
      disposeRealmObject(root);
    } catch {
      // Cancellation remains primary after best-effort decoded-resource cleanup.
    }
    throwIfRealmLoadAborted(options.signal, 'Hegemony landscape base');
  }
  return { root, assetUrl };
}

export function clearHegemonyLandscapeBaseBinaryCacheForTests() {
  landscapeBaseBinaryRequests.clear();
}
