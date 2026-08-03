import * as THREE from 'three';

import type { RealmForestEcologyHabitat } from '../../game/map/realmForestEcology';
import type {
  RealmNorthernSnowField
} from '../../game/map/realmNorthernSnow';
import type {
  RealmSouthernDesertField
} from '../../game/map/realmSouthernDesert';
import type { HexWorldPosition } from '../../game/map/hexCoordinates';

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

export const REALM_FOREST_SNOW_COVERAGE_ONSET = 0.25;
export const REALM_FOREST_MAX_AUTHORED_SNOW_MIX = 0.54;
export const REALM_FOREST_MAX_WINTER_TINT_MIX = 0.18;
export const REALM_FOREST_SAND_COVERAGE_ONSET = 0.25;
export const REALM_FOREST_MAX_AUTHORED_DRY_MIX = 0.24;
export const REALM_FOREST_MAX_DRYLAND_TINT_MIX = 0.16;

type MutableFallbackGeometry = {
  positions: number[];
  colors: number[];
  indices: number[];
};

const ROOT_COLOR = new THREE.Color('#5f6652');
const TRUNK_COLOR = new THREE.Color('#b79a72');
const FOREST_SNOW_PEARL = new THREE.Color('#dbe7e8');
const FOREST_WINTER_TINT = new THREE.Color('#c6d7dc');
const FOREST_DRYLAND_DUST = new THREE.Color('#b89a66');
const FOREST_DRYLAND_TINT = new THREE.Color('#b99b63');
export const REALM_FOREST_SNOW_PEARL_LINEAR = Object.freeze({
  r: FOREST_SNOW_PEARL.r,
  g: FOREST_SNOW_PEARL.g,
  b: FOREST_SNOW_PEARL.b
});
export const REALM_FOREST_DRYLAND_DUST_LINEAR = Object.freeze({
  r: FOREST_DRYLAND_DUST.r,
  g: FOREST_DRYLAND_DUST.g,
  b: FOREST_DRYLAND_DUST.b
});
const CANOPY_COLORS = Object.freeze([
  new THREE.Color('#e1edda'),
  new THREE.Color('#d5e7ce'),
  new THREE.Color('#edf3df')
]);

function clampUnit(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clampUnit((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

/**
 * Static, fail-closed forest snow sampling. Callers use this only while
 * building an existing batch or repacking the existing camera-local window.
 */
export function sampleRealmForestSnowCoverage(
  northernSnow: RealmNorthernSnowField | undefined,
  world: HexWorldPosition
) {
  if (!northernSnow) return 0;
  try {
    return clampUnit(northernSnow.coverageAtWorld(world));
  } catch {
    return 0;
  }
}

/**
 * Static, fail-closed dryland sampling. Zero sand remains a strict no-op so
 * the established northern and central forest color buffers stay identical.
 */
export function sampleRealmForestSandCoverage(
  southernDesert: RealmSouthernDesertField | undefined,
  world: HexWorldPosition
) {
  if (!southernDesert) return 0;
  try {
    return clampUnit(southernDesert.sandAtWorld(world));
  } catch {
    return 0;
  }
}

/** Restrained top-facing dusting for the existing shared vertex-color batch. */
export function realmForestAuthoredSnowMix(
  coverageInput: number,
  transformedNormalYInput: number
) {
  const coverage = clampUnit(coverageInput);
  const transformedNormalY = Number.isFinite(transformedNormalYInput)
    ? Math.min(1, Math.max(-1, transformedNormalYInput))
    : -1;
  const coverageMix = smoothstep(
    REALM_FOREST_SNOW_COVERAGE_ONSET,
    0.88,
    coverage
  );
  const topFacing = smoothstep(0.08, 0.78, transformedNormalY);
  return coverageMix * topFacing * REALM_FOREST_MAX_AUTHORED_SNOW_MIX;
}

/** Simpler bounded tint for existing fallback and decorative instance colors. */
export function realmForestWinterTintMix(coverageInput: number) {
  return smoothstep(
    REALM_FOREST_SNOW_COVERAGE_ONSET,
    0.88,
    clampUnit(coverageInput)
  ) * REALM_FOREST_MAX_WINTER_TINT_MIX;
}

/** Warm, restrained dryland treatment for the existing authored color batch. */
export function realmForestAuthoredDryMix(sandInput: number) {
  return smoothstep(
    REALM_FOREST_SAND_COVERAGE_ONSET,
    0.88,
    clampUnit(sandInput)
  ) * REALM_FOREST_MAX_AUTHORED_DRY_MIX;
}

/** Smaller warm shift for the existing fallback/decorative instance colors. */
export function realmForestDrylandTintMix(sandInput: number) {
  return smoothstep(
    REALM_FOREST_SAND_COVERAGE_ONSET,
    0.88,
    clampUnit(sandInput)
  ) * REALM_FOREST_MAX_DRYLAND_TINT_MIX;
}

export function applyRealmForestWinterTint(
  color: THREE.Color,
  coverageInput: number
) {
  return color.lerp(FOREST_WINTER_TINT, realmForestWinterTintMix(coverageInput));
}

export function applyRealmForestDrylandTint(
  color: THREE.Color,
  sandInput: number
) {
  const mix = realmForestDrylandTintMix(sandInput);
  return mix > 0 ? color.lerp(FOREST_DRYLAND_TINT, mix) : color;
}

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
  targetHeightInput: number,
  includeWindAttributes = false
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
  if (includeWindAttributes) {
    const windWeights = new Uint8Array(output.positions.length / 3);
    const windPhases = new Uint8Array(output.positions.length / 3);
    for (let index = 0; index < windWeights.length; index += 1) {
      const x = output.positions[index * 3] ?? 0;
      const y = output.positions[index * 3 + 1] ?? 0;
      const z = output.positions[index * 3 + 2] ?? 0;
      const normalizedHeight = THREE.MathUtils.clamp(
        (y / targetHeight - 0.18) / 0.72,
        0,
        1
      );
      windWeights[index] = Math.round(normalizedHeight * 255);
      const phase = Math.sin(x * 91.7 + z * 63.1 + y * 17.3) * 0.5 + 0.5;
      windPhases[index] = Math.round(THREE.MathUtils.clamp(phase, 0, 1) * 255);
    }
    geometry.setAttribute(
      'realmForestWindWeight',
      new THREE.Uint8BufferAttribute(windWeights, 1, true)
    );
    geometry.setAttribute(
      'realmForestWindPhase',
      new THREE.Uint8BufferAttribute(windPhases, 1, true)
    );
  }
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
  if (habitat === 'grove') return '#477d47';
  if (habitat === 'forest') return '#538653';
  return '#73955f';
}

/** Restrained green-white tint for authored model instances. */
export function realmForestModelInstanceTint(
  habitat: RealmForestEcologyHabitat
) {
  if (habitat === 'grove') return '#cfe9c8';
  if (habitat === 'forest') return '#d7eed1';
  return '#e6f0d7';
}
