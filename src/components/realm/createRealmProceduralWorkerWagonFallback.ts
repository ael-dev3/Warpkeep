import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const REALM_PROCEDURAL_WORKER_WAGON_FALLBACK_ID =
  'procedural-body-wheels-v1';

export type RealmProceduralWorkerWagonFallback = Readonly<{
  geometry: THREE.BufferGeometry;
  fallbackId: typeof REALM_PROCEDURAL_WORKER_WAGON_FALLBACK_ID;
  bodyPartCount: 3;
  wheelCount: 4;
  triangleCount: number;
  /** The route layer and loaded wagon assets both travel toward local +Z. */
  forwardAxis: '+z';
}>;

function colorGeometry(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation
) {
  const position = geometry.getAttribute('position');
  const value = new THREE.Color(color);
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    colors[index * 3] = value.r;
    colors[index * 3 + 1] = value.g;
    colors[index * 3 + 2] = value.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * One merged, low-poly wagon silhouette for every model-loading failure path.
 * It remains a single instanced draw while retaining a body, raised cargo
 * rail, forward drawbar, and four independently legible wheels.
 */
export function createRealmProceduralWorkerWagonFallback():
RealmProceduralWorkerWagonFallback {
  const body = colorGeometry(
    new THREE.BoxGeometry(0.36, 0.18, 0.48),
    '#d3a55b'
  );
  body.translate(0, 0.2, -0.015);

  const cargoRail = colorGeometry(
    new THREE.BoxGeometry(0.32, 0.12, 0.28),
    '#e1bd77'
  );
  cargoRail.translate(0, 0.34, -0.06);

  const drawbar = colorGeometry(
    new THREE.BoxGeometry(0.075, 0.07, 0.36),
    '#8b6339'
  );
  drawbar.translate(0, 0.15, 0.37);

  const parts: THREE.BufferGeometry[] = [body, cargoRail, drawbar];
  for (const x of [-0.205, 0.205] as const) {
    for (const z of [-0.16, 0.16] as const) {
      const wheel = colorGeometry(
        new THREE.CylinderGeometry(0.105, 0.105, 0.055, 10, 1, false),
        '#3d342d'
      );
      wheel.rotateZ(Math.PI * 0.5);
      wheel.translate(x, 0.105, z);
      parts.push(wheel);
    }
  }

  let geometry: THREE.BufferGeometry | null = null;
  try {
    geometry = mergeGeometries(parts, false);
  } finally {
    for (const part of parts) part.dispose();
  }
  if (!geometry) throw new Error('REALM_WORKER_FALLBACK_MERGE_FAILED');
  geometry.name = 'realm-procedural-worker-wagon-fallback';
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const triangleCount = geometry.index
    ? geometry.index.count / 3
    : geometry.getAttribute('position').count / 3;
  return Object.freeze({
    geometry,
    fallbackId: REALM_PROCEDURAL_WORKER_WAGON_FALLBACK_ID,
    bodyPartCount: 3,
    wheelCount: 4,
    triangleCount,
    forwardAxis: '+z'
  });
}
