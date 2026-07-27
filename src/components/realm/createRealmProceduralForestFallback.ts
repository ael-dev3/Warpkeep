import * as THREE from 'three';

import type { RealmForestEcologyHabitat } from '../../game/map/realmForestEcology';

export const REALM_PROCEDURAL_FOREST_FALLBACK_TYPE =
  'procedural-trunk-multi-canopy-v1' as const;
export const REALM_FOREST_CANOPY_MOTION_STATE = 'static' as const;

export type RealmForestFallbackType =
  | 'none'
  | typeof REALM_PROCEDURAL_FOREST_FALLBACK_TYPE;
export type RealmForestGroundingMode =
  | 'none'
  | 'terrain-canopy'
  | 'terrain-canopy-baked-base'
  | 'terrain-canopy-procedural-root-contact';

type MutableFallbackGeometry = {
  positions: number[];
  colors: number[];
  indices: number[];
};

const ROOT_COLOR = new THREE.Color('#5f6652');
const TRUNK_COLOR = new THREE.Color('#b79a72');
const CANOPY_COLORS = Object.freeze([
  new THREE.Color('#e1edda'),
  new THREE.Color('#d5e7ce'),
  new THREE.Color('#edf3df')
]);

function appendVertex(
  output: MutableFallbackGeometry,
  x: number,
  y: number,
  z: number,
  color: THREE.Color
) {
  const index = output.positions.length / 3;
  output.positions.push(x, y, z);
  output.colors.push(color.r, color.g, color.b);
  return index;
}

function appendRootContact(
  output: MutableFallbackGeometry,
  radius: number,
  y: number
) {
  const center = appendVertex(output, 0, y, 0, ROOT_COLOR);
  const ring = Array.from({ length: 8 }, (_, index) => {
    const angle = index / 8 * Math.PI * 2;
    return appendVertex(
      output,
      Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius,
      ROOT_COLOR
    );
  });
  ring.forEach((current, index) => {
    const next = ring[(index + 1) % ring.length]!;
    output.indices.push(center, next, current);
  });
}

function appendTaperedTrunk(
  output: MutableFallbackGeometry,
  bottomRadius: number,
  topRadius: number,
  height: number
) {
  const sides = 7;
  const bottom = Array.from({ length: sides }, (_, index) => {
    const angle = index / sides * Math.PI * 2;
    return appendVertex(
      output,
      Math.cos(angle) * bottomRadius,
      0,
      Math.sin(angle) * bottomRadius,
      TRUNK_COLOR
    );
  });
  const top = Array.from({ length: sides }, (_, index) => {
    const angle = index / sides * Math.PI * 2;
    return appendVertex(
      output,
      Math.cos(angle) * topRadius,
      height,
      Math.sin(angle) * topRadius,
      TRUNK_COLOR
    );
  });
  const topCenter = appendVertex(output, 0, height, 0, TRUNK_COLOR);
  bottom.forEach((bottomCurrent, index) => {
    const nextIndex = (index + 1) % sides;
    const bottomNext = bottom[nextIndex]!;
    const topCurrent = top[index]!;
    const topNext = top[nextIndex]!;
    output.indices.push(
      bottomCurrent,
      topCurrent,
      bottomNext,
      bottomNext,
      topCurrent,
      topNext,
      topCenter,
      topCurrent,
      topNext
    );
  });
}

function appendCanopyLobe(
  output: MutableFallbackGeometry,
  center: Readonly<{ x: number; y: number; z: number }>,
  radii: Readonly<{ x: number; y: number; z: number }>,
  color: THREE.Color,
  phase: number
) {
  const sides = 7;
  const top = appendVertex(
    output,
    center.x,
    center.y + radii.y,
    center.z,
    color
  );
  const bottom = appendVertex(
    output,
    center.x,
    center.y - radii.y,
    center.z,
    color
  );
  const ring = Array.from({ length: sides }, (_, index) => {
    const angle = phase + index / sides * Math.PI * 2;
    return appendVertex(
      output,
      center.x + Math.cos(angle) * radii.x,
      center.y,
      center.z + Math.sin(angle) * radii.z,
      color
    );
  });
  ring.forEach((current, index) => {
    const next = ring[(index + 1) % sides]!;
    output.indices.push(top, current, next, bottom, next, current);
  });
}

/**
 * One compact, asymmetric tree contains a root-contact polygon, tapered trunk,
 * and three overlapping canopy lobes. It remains one instanced draw call and
 * is intentionally low-poly enough for every existing forest fallback budget.
 */
export function createRealmProceduralForestFallbackGeometry(
  targetHeightInput: number
) {
  const targetHeight = Number.isFinite(targetHeightInput) && targetHeightInput > 0
    ? Math.max(0.2, targetHeightInput)
    : 0.62;
  const output: MutableFallbackGeometry = {
    positions: [],
    colors: [],
    indices: []
  };
  appendRootContact(output, targetHeight * 0.105, targetHeight * 0.003);
  appendTaperedTrunk(
    output,
    targetHeight * 0.043,
    targetHeight * 0.026,
    targetHeight * 0.62
  );
  appendCanopyLobe(
    output,
    { x: -targetHeight * 0.025, y: targetHeight * 0.67, z: 0 },
    {
      x: targetHeight * 0.2,
      y: targetHeight * 0.25,
      z: targetHeight * 0.17
    },
    CANOPY_COLORS[0]!,
    0
  );
  appendCanopyLobe(
    output,
    {
      x: targetHeight * 0.035,
      y: targetHeight * 0.84,
      z: -targetHeight * 0.018
    },
    {
      x: targetHeight * 0.14,
      y: targetHeight * 0.16,
      z: targetHeight * 0.125
    },
    CANOPY_COLORS[1]!,
    Math.PI / 7
  );
  appendCanopyLobe(
    output,
    {
      x: targetHeight * 0.095,
      y: targetHeight * 0.63,
      z: targetHeight * 0.045
    },
    {
      x: targetHeight * 0.12,
      y: targetHeight * 0.17,
      z: targetHeight * 0.105
    },
    CANOPY_COLORS[2]!,
    Math.PI / 3
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(output.positions, 3)
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(output.colors, 3)
  );
  geometry.setIndex(new THREE.Uint16BufferAttribute(output.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return Object.freeze({
    geometry,
    triangleCount: output.indices.length / 3,
    fallbackType: REALM_PROCEDURAL_FOREST_FALLBACK_TYPE,
    includesRootContact: true as const
  });
}

export function createRealmProceduralForestFallbackMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide
  });
}

/** Strong fallback palette; vertex colors retain a brown trunk beneath it. */
export function realmForestFallbackInstanceColor(
  habitat: RealmForestEcologyHabitat
) {
  if (habitat === 'grove') return '#3f6a43';
  if (habitat === 'forest') return '#497548';
  return '#68845a';
}

/** Restrained near-white tint for authored model instances. */
export function realmForestModelInstanceTint(
  habitat: RealmForestEcologyHabitat
) {
  if (habitat === 'grove') return '#dbe7d7';
  if (habitat === 'forest') return '#e7eee1';
  return '#f1eddc';
}
