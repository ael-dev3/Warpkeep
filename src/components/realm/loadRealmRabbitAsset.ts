import * as THREE from 'three';

import {
  disposeRealmObject,
  readExactRealmModelResponseBody,
  resolveIntegrityPinnedRealmAssetUrl
} from './loadHegemonyKeep';
import { REALM_RABBIT_RUNTIME_ASSET } from './realmRabbitRuntimeAsset';

export type RealmRabbitPrefab = Readonly<{
  assetUrl: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  sourceRoot: THREE.Object3D;
  release: () => void;
}>;

export type LoadRealmRabbitAssetOptions = Readonly<{
  baseUrl: string;
  signal?: AbortSignal;
  /** Bounds the transport and exact-body verification work. */
  requestTimeoutMs?: number;
}>;

export const DEFAULT_REALM_RABBIT_REQUEST_TIMEOUT_MS = 20_000;
const MAX_REALM_RABBIT_REQUEST_TIMEOUT_MS = 60_000;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function normalizedRequestTimeout(timeoutMs: number | undefined) {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_REALM_RABBIT_REQUEST_TIMEOUT_MS;
  return Math.max(1, Math.min(
    MAX_REALM_RABBIT_REQUEST_TIMEOUT_MS,
    Math.trunc(timeoutMs ?? DEFAULT_REALM_RABBIT_REQUEST_TIMEOUT_MS)
  ));
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

function isObjectRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Defense in depth around GLTFLoader's resource resolver. The reviewed GLB is
 * self-contained, so parsing may never discover a dependent URL even after a
 * future asset refresh updates the pinned digest and byte coordinates.
 */
export function assertEmbeddedRealmRabbitRuntime(bytes: ArrayBuffer) {
  const asset = REALM_RABBIT_RUNTIME_ASSET;
  if (bytes.byteLength !== asset.bytes || bytes.byteLength < 28) {
    throw new Error('Lowlands Rabbit compact runtime container changed.');
  }
  const view = new DataView(bytes);
  const jsonLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  const jsonEnd = 20 + jsonLength;
  if (
    view.getUint32(0, true) !== 0x46546c67
    || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength
    || jsonChunkType !== GLB_JSON_CHUNK_TYPE
    || jsonLength === 0
    || jsonEnd > bytes.byteLength
  ) {
    throw new Error('Lowlands Rabbit compact runtime container changed.');
  }
  let json: Readonly<Record<string, unknown>>;
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true })
        .decode(new Uint8Array(bytes, 20, jsonLength))
        .trim()
    );
    if (!isObjectRecord(parsed)) {
      throw new TypeError('Expected a glTF JSON object.');
    }
    json = parsed;
  } catch {
    throw new Error('Lowlands Rabbit compact runtime JSON changed.');
  }
  const buffers: readonly unknown[] = Array.isArray(json.buffers) ? json.buffers : [];
  const buffer = buffers[0];
  if (
    buffers.length !== 1
    || !isObjectRecord(buffer)
    || buffer.byteLength !== asset.embeddedBufferBytes
    || Object.prototype.hasOwnProperty.call(buffer, 'uri')
    || json.images !== undefined
    || json.textures !== undefined
    || json.samplers !== undefined
  ) {
    throw new Error('Lowlands Rabbit compact runtime must remain self-contained.');
  }
}

async function requestVerifiedRealmRabbitBytes(
  assetUrl: string,
  options: LoadRealmRabbitAssetOptions
) {
  const asset = REALM_RABBIT_RUNTIME_ASSET;
  const timeoutMs = normalizedRequestTimeout(options.requestTimeoutMs);
  const abortController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let externalAbortListener: (() => void) | undefined;
  const externalAbort = options.signal
    ? new Promise<never>((_resolve, reject) => {
        externalAbortListener = () => {
          abortController.abort();
          reject(abortError());
        };
        if (options.signal?.aborted) externalAbortListener();
        else options.signal?.addEventListener('abort', externalAbortListener, { once: true });
      })
    : undefined;
  const fetchRequest = Promise.resolve()
    .then(() => fetch(assetUrl, {
      credentials: 'same-origin',
      redirect: 'error',
      signal: abortController.signal
    }))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Lowlands Rabbit request failed with ' + response.status + '.');
      }
      const bytes = await readExactRealmModelResponseBody(
        response,
        asset.bytes,
        'Lowlands Rabbit compact runtime asset'
      );
      if (await sha256Hex(bytes) !== asset.sha256) {
        throw new Error('Lowlands Rabbit compact runtime asset failed its integrity check.');
      }
      return bytes;
    });
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Lowlands Rabbit request timed out after ${timeoutMs}ms.`));
      abortController.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race(
      externalAbort ? [fetchRequest, timeout, externalAbort] : [fetchRequest, timeout]
    );
  } catch (error) {
    // Retire a response body on status, streaming, length, integrity, timeout,
    // or caller-abort failure. This also prevents unread error bodies lingering.
    abortController.abort();
    throw error;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    if (externalAbortListener) {
      options.signal?.removeEventListener('abort', externalAbortListener);
    }
  }
}

/**
 * Load the exact compact rabbit from the same-origin public runtime. The
 * model remains visual-only: its geometry is never used for collision,
 * picking, terrain, navigation, or Realm authority.
 */
export async function loadRealmRabbitAsset(
  options: LoadRealmRabbitAssetOptions
): Promise<RealmRabbitPrefab> {
  const asset = REALM_RABBIT_RUNTIME_ASSET;
  const assetUrl = resolveIntegrityPinnedRealmAssetUrl(
    options.baseUrl,
    asset.path,
    asset.sha256
  );
  const bytes = await requestVerifiedRealmRabbitBytes(assetUrl, options);
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  assertEmbeddedRealmRabbitRuntime(bytes);
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const loaded = await loader.parseAsync(
    bytes.slice(0),
    assetUrl.slice(0, assetUrl.lastIndexOf('/') + 1)
  );
  if (options.signal?.aborted) {
    disposeRealmObject(loaded.scene);
    throw new DOMException('Aborted', 'AbortError');
  }
  const meshes: THREE.Mesh[] = [];
  loaded.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const mesh = meshes[0];
  const material = mesh && !Array.isArray(mesh.material)
    ? mesh.material
    : undefined;
  const positionCount = mesh?.geometry.getAttribute('position')?.count ?? 0;
  const triangleCount = (mesh?.geometry.getIndex()?.count ?? 0) / 3;
  if (
    meshes.length !== 1
    || !mesh
    || !material
    || positionCount !== asset.uploadedVertices
    || triangleCount !== asset.triangles
  ) {
    disposeRealmObject(loaded.scene);
    throw new Error('Lowlands Rabbit compact runtime structure changed.');
  }
  let released = false;
  return Object.freeze({
    assetUrl,
    geometry: mesh.geometry,
    material,
    sourceRoot: loaded.scene,
    release: () => {
      if (released) return;
      released = true;
      disposeRealmObject(loaded.scene);
    }
  });
}
