import * as THREE from 'three';

import { GENESIS_WATER_SUN_DIRECTION_MICRO } from '../../../spacetimedb/src/waterWorld';
import {
  REALM_ENVIRONMENT_SPECS,
  type RealmQuality
} from './realmQuality';

const BELOW_HORIZON = new THREE.Color('#625d4d');
const HORIZON = new THREE.Color('#b9cad8');
const UPPER_SKY = new THREE.Color('#7694bb');
const ZENITH = new THREE.Color('#425f88');

const HORIZON_DIRECTION_Y = -0.04;
const UPPER_SKY_DIRECTION_Y = 0.34;
const SKY_DOME_RADIUS = 48;
const SUN_DISC_RADIUS = 46.8;
const SUN_DISC_ANGULAR_RADIUS = THREE.MathUtils.degToRad(0.82);
const SUN_GLOW_ANGULAR_RADIUS = THREE.MathUtils.degToRad(7.5);
const SUN_GLOW_COLOUR = new THREE.Color('#fff2c9');
const SUN_GLOW_INTENSITY = 0.86;

const SUN_LIGHT_DISTANCE = Math.hypot(4.5, 14, 10.5);

const NORMALIZED_SUN_DIRECTION = new THREE.Vector3(
  GENESIS_WATER_SUN_DIRECTION_MICRO.x,
  GENESIS_WATER_SUN_DIRECTION_MICRO.y,
  GENESIS_WATER_SUN_DIRECTION_MICRO.z
).normalize();

/** Scene light position derived from the public fixed-point environment row. */
export const REALM_SUN_LIGHT_POSITION = Object.freeze({
  x: NORMALIZED_SUN_DIRECTION.x * SUN_LIGHT_DISTANCE,
  y: NORMALIZED_SUN_DIRECTION.y * SUN_LIGHT_DISTANCE,
  z: NORMALIZED_SUN_DIRECTION.z * SUN_LIGHT_DISTANCE
});

/** Shared direction for the generated IBL highlight, visible disc and light. */
export const REALM_SUN_DIRECTION = Object.freeze({
  x: NORMALIZED_SUN_DIRECTION.x,
  y: NORMALIZED_SUN_DIRECTION.y,
  z: NORMALIZED_SUN_DIRECTION.z
});

export const REALM_SKY_FALLBACK_COLOR = '#b9cad8';

export type RealmSkyColour = Readonly<{
  r: number;
  g: number;
  b: number;
}>;

export type RealmEnvironmentDepth = Readonly<{
  group: THREE.Group;
  environmentMap: THREE.DataTexture;
  environmentIntensity: number;
  sunDirection: Readonly<{ x: number; y: number; z: number }>;
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
 * Below the visible ocean horizon, continue the fog colour rather than the
 * lower hemisphere used for image-based lighting. The canonical full-fog
 * water can then dissolve into the sky dome without revealing a map edge,
 * while the environment map retains its authored lighting contrast.
 */
function sampleRealmVisibleSkyGradient(directionY: number): RealmSkyColour {
  const y = clamp(Number.isFinite(directionY) ? directionY : 0, -1, 1);
  if (y <= HORIZON_DIRECTION_Y) {
    return Object.freeze({ r: HORIZON.r, g: HORIZON.g, b: HORIZON.b });
  }
  return sampleRealmSkyGradient(y);
}

function sampleRealmEnvironmentColour(direction: THREE.Vector3) {
  const sampledSky = sampleRealmSkyGradient(direction.y);
  const colour = new THREE.Color(sampledSky.r, sampledSky.g, sampledSky.b);
  const angleFromSun = Math.acos(clamp(direction.dot(NORMALIZED_SUN_DIRECTION), -1, 1));
  const normalizedDistance = angleFromSun / SUN_GLOW_ANGULAR_RADIUS;
  const glow = Math.exp(-(normalizedDistance * normalizedDistance)) * SUN_GLOW_INTENSITY;
  return colour.lerp(SUN_GLOW_COLOUR, glow);
}

function createRealmEnvironmentMap(quality: RealmQuality) {
  const spec = REALM_ENVIRONMENT_SPECS[quality];
  const data = new Uint8Array(spec.textureWidth * spec.textureHeight * 4);
  const direction = new THREE.Vector3();

  for (let y = 0; y < spec.textureHeight; y += 1) {
    const latitude = (((y + 0.5) / spec.textureHeight) - 0.5) * Math.PI;
    const latitudeCosine = Math.cos(latitude);
    for (let x = 0; x < spec.textureWidth; x += 1) {
      const longitude = (((x + 0.5) / spec.textureWidth) - 0.5) * Math.PI * 2;
      direction.set(
        latitudeCosine * Math.cos(longitude),
        Math.sin(latitude),
        latitudeCosine * Math.sin(longitude)
      );
      const colour = sampleRealmEnvironmentColour(direction).convertLinearToSRGB();
      const offset = (y * spec.textureWidth + x) * 4;
      data[offset] = Math.round(clamp(colour.r, 0, 1) * 255);
      data[offset + 1] = Math.round(clamp(colour.g, 0, 1) * 255);
      data[offset + 2] = Math.round(clamp(colour.b, 0, 1) * 255);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    spec.textureWidth,
    spec.textureHeight,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.name = `realm-procedural-environment-${quality}`;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createSunDisc(quality: RealmQuality) {
  const spec = REALM_ENVIRONMENT_SPECS[quality];
  const geometry = new THREE.CircleGeometry(
    Math.tan(SUN_DISC_ANGULAR_RADIUS) * SUN_DISC_RADIUS,
    spec.sunDiscSegments
  );
  let material: THREE.MeshBasicMaterial | undefined;
  try {
    material = new THREE.MeshBasicMaterial({
      color: '#fff3c9',
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    const disc = new THREE.Mesh(geometry, material);
    disc.name = 'realm-procedural-sun-disc';
    disc.position.copy(NORMALIZED_SUN_DIRECTION).multiplyScalar(SUN_DISC_RADIUS);
    disc.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      NORMALIZED_SUN_DIRECTION.clone().negate()
    );
    disc.frustumCulled = false;
    disc.renderOrder = -999;
    return { disc, geometry, material };
  } catch (error) {
    geometry.dispose();
    material?.dispose();
    throw error;
  }
}

/**
 * Creates a camera-centred, non-interactive sky dome. Its interpolated vertex
 * colours add horizon and atmospheric depth without a shader or animation
 * loop. The same owner also provides a tiny generated IBL map and sun disc.
 */
export function createRealmEnvironmentDepth(quality: RealmQuality): RealmEnvironmentDepth {
  const horizontalSegments = quality === 'reduced' ? 16 : 24;
  const verticalSegments = quality === 'reduced' ? 8 : 12;
  const geometry = new THREE.SphereGeometry(SKY_DOME_RADIUS, horizontalSegments, verticalSegments);
  const positions = geometry.getAttribute('position');
  const colours = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const colour = sampleRealmVisibleSkyGradient(positions.getY(index) / SKY_DOME_RADIUS);
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

  let environmentMap: THREE.DataTexture | undefined;
  let sunDisc: ReturnType<typeof createSunDisc> | undefined;
  try {
    environmentMap = createRealmEnvironmentMap(quality);
    sunDisc = createSunDisc(quality);
  } catch (error) {
    geometry.dispose();
    material.dispose();
    environmentMap?.dispose();
    sunDisc?.geometry.dispose();
    sunDisc?.material.dispose();
    throw error;
  }
  const group = new THREE.Group();
  group.name = 'realm-environment-depth';
  group.add(dome, sunDisc.disc);

  let disposed = false;
  return Object.freeze({
    group,
    environmentMap,
    environmentIntensity: REALM_ENVIRONMENT_SPECS[quality].environmentIntensity,
    sunDirection: REALM_SUN_DIRECTION,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      sunDisc.geometry.dispose();
      sunDisc.material.dispose();
      environmentMap.dispose();
    }
  });
}
