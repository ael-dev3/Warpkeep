import * as THREE from 'three';

import type { RealmQuality } from './realmQuality';

const BELOW_HORIZON = new THREE.Color('#3a3942');
const HORIZON = new THREE.Color('#9498a6');
const UPPER_SKY = new THREE.Color('#626a80');
const ZENITH = new THREE.Color('#30394f');

const HORIZON_DIRECTION_Y = -0.04;
const UPPER_SKY_DIRECTION_Y = 0.34;

export const REALM_SKY_FALLBACK_COLOR = '#9498a6';

export type RealmSkyColour = Readonly<{
  r: number;
  g: number;
  b: number;
}>;

export type RealmEnvironmentDepth = Readonly<{
  group: THREE.Group;
  dispose: () => void;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function colourBetween(first: THREE.Color, second: THREE.Color, amount: number) {
  const colour = first.clone().lerp(second, clamp(amount, 0, 1));
  return Object.freeze({ r: colour.r, g: colour.g, b: colour.b });
}

/** Deterministic, asset-free sky colour for a normalized dome direction. */
export function sampleRealmSkyGradient(directionY: number): RealmSkyColour {
  const y = clamp(Number.isFinite(directionY) ? directionY : 0, -1, 1);
  if (y <= HORIZON_DIRECTION_Y) {
    return colourBetween(
      BELOW_HORIZON,
      HORIZON,
      (y + 1) / (HORIZON_DIRECTION_Y + 1)
    );
  }
  if (y <= UPPER_SKY_DIRECTION_Y) {
    return colourBetween(
      HORIZON,
      UPPER_SKY,
      (y - HORIZON_DIRECTION_Y) / (UPPER_SKY_DIRECTION_Y - HORIZON_DIRECTION_Y)
    );
  }
  return colourBetween(
    UPPER_SKY,
    ZENITH,
    (y - UPPER_SKY_DIRECTION_Y) / (1 - UPPER_SKY_DIRECTION_Y)
  );
}

/**
 * Creates a camera-centred, non-interactive sky dome. Its interpolated vertex
 * colours add horizon and atmospheric depth without textures, shaders, or an
 * animation loop.
 */
export function createRealmEnvironmentDepth(quality: RealmQuality): RealmEnvironmentDepth {
  const horizontalSegments = quality === 'reduced' ? 16 : 24;
  const verticalSegments = quality === 'reduced' ? 8 : 12;
  const geometry = new THREE.SphereGeometry(48, horizontalSegments, verticalSegments);
  const positions = geometry.getAttribute('position');
  const colours = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const colour = sampleRealmSkyGradient(positions.getY(index) / 48);
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'realm-procedural-sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = -1_000;

  const group = new THREE.Group();
  group.name = 'realm-environment-depth';
  group.add(dome);

  let disposed = false;
  return Object.freeze({
    group,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
    }
  });
}
