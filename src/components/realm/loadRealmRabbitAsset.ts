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
}>;

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
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
  const response = await fetch(assetUrl, {
    credentials: 'same-origin',
    redirect: 'error',
    signal: options.signal
  });
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
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
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
