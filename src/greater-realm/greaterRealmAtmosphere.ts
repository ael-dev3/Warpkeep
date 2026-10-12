import * as THREE from 'three';
import type { GreaterRealmGraphicsProfile } from './greaterRealmRuntimePolicy';
import { greaterRealmGeometryBytes } from './greaterRealmActorGeometry';

// Daylight atmosphere for the 0.4 Greater Realm view. The streamed public
// window ends where the player's knowledge ends; instead of a black void, the
// known land now rises from a soft sea of cloud under a pale sky, with a few
// high clouds and birds for life. Presentation only: nothing here is
// selectable, grounded on authority data or part of the fitted world bounds.

export const GREATER_REALM_SKY = Object.freeze({ background: '#c3d3d1', fog: '#c6d5d2' });

const LAYER_COUNTS: Readonly<Record<GreaterRealmGraphicsProfile, { lowClouds: number; highClouds: number; birds: number }>> = {
  high: { lowClouds: 22, highClouds: 6, birds: 14 },
  balanced: { lowClouds: 16, highClouds: 4, birds: 8 },
  reduced: { lowClouds: 10, highClouds: 0, birds: 0 },
};
/** Upper bounds for host budget reservations. */
export const GREATER_REALM_ATMOSPHERE_MAXIMUM_DRAW_CALLS = 2;
export const GREATER_REALM_ATMOSPHERE_MAXIMUM_INSTANCES = 22 + 6 + 14;

export type GreaterRealmAtmosphere = Readonly<{
  group: THREE.Group;
  maximumUploadBytes: number;
  prepareForUpload: (availableBytes: number) => number;
  consumePendingUploadBytes: () => number;
  invalidateUploads: () => void;
  setFrame: (centerX: number, centerZ: number, span: number) => void;
  configure: (profile: GreaterRealmGraphicsProfile, reducedMotion: boolean) => void;
  /** Daylight mood: clouds take the sky's colour and the birds roost after dusk. */
  setDaylight: (mood: Readonly<{ hazeColor: THREE.Color; skyColor: THREE.Color; night: number }>) => void;
  update: (elapsedSeconds: number) => boolean;
  drawCalls: () => number;
  instanceCount: () => number;
  dispose: () => void;
}>;

function cloudClusterGeometry() {
  // Five flattened lobes merged into one stylised, flat-shaded cloud.
  const lobes: Array<[number, number, number, number]> = [[0, 0, 0, 1.25], [1.15, -.08, .25, .9], [-1.1, -.12, -.2, .95], [.35, .32, -.55, .8], [-.4, .25, .6, .75]];
  const positions: number[] = [];
  for (const [x, y, z, radius] of lobes) {
    const lobe = new THREE.IcosahedronGeometry(radius, 1); lobe.scale(1, .62, 1); lobe.translate(x, y, z);
    positions.push(...(lobe.getAttribute('position').array as Float32Array)); lobe.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function birdGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, .12, -.36, .15, -.08, 0, 0, -.1,
    0, 0, .12, 0, 0, -.1, .36, .15, -.08,
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
}

const unit = (seed: number) => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

export function createGreaterRealmAtmosphere(options: Readonly<{ profile: GreaterRealmGraphicsProfile; reducedMotion: boolean }>): GreaterRealmAtmosphere {
  const group = new THREE.Group(); group.name = 'greater-realm-atmosphere';
  const cloudGeometry = cloudClusterGeometry(); const birdShape = birdGeometry();
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#a9bcba', emissiveIntensity: .5, flatShading: true, fog: true });
  const birdMaterial = new THREE.MeshLambertMaterial({ color: '#2f3637', side: THREE.DoubleSide, fog: true });
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, LAYER_COUNTS.high.lowClouds + LAYER_COUNTS.high.highClouds);
  const birds = new THREE.InstancedMesh(birdShape, birdMaterial, LAYER_COUNTS.high.birds);
  for (const mesh of [clouds, birds]) { mesh.raycast = () => {}; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(mesh); }
  clouds.name = 'greater-realm-atmosphere-clouds'; birds.name = 'greater-realm-atmosphere-birds';
  let profile = options.profile; let reducedMotion = options.reducedMotion; let disposed = false; let roosting = false;
  const cloudDayEmissive = new THREE.Color('#a9bcba');
  let centerX = 0; let centerZ = 0; let span = 48;
  const matrix = new THREE.Matrix4(); const quaternion = new THREE.Quaternion(); const euler = new THREE.Euler();
  const position = new THREE.Vector3(); const scale = new THREE.Vector3();
  // These owned attributes acknowledge a transfer only when Three uploads it.
  // A hidden/deferred group retains every dirty version for a later frame.
  let uploadedVersions = new WeakMap<THREE.BufferAttribute, number>();
  const observedAttributes = new WeakSet<THREE.BufferAttribute>();
  let uploadedThisFrame = 0;
  const attributes = () => {
    const values: THREE.BufferAttribute[] = [];
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      if (object instanceof THREE.InstancedMesh && object.count === 0) return;
      values.push(...Object.values(object.geometry.attributes) as THREE.BufferAttribute[]);
      if (object.geometry.index) values.push(object.geometry.index);
      if (object instanceof THREE.InstancedMesh) {
        values.push(object.instanceMatrix);
        if (object.instanceColor) values.push(object.instanceColor);
      }
    });
    return values;
  };
  const pendingUploadBytes = () => attributes().reduce((bytes, attribute) =>
    bytes + (uploadedVersions.get(attribute) === attribute.version ? 0 : attribute.array.byteLength), 0);
  const prepareForUpload = (availableBytes: number) => {
    const values = attributes();
    const pending = pendingUploadBytes();
    group.visible = Number.isFinite(availableBytes) && availableBytes >= pending;
    for (const attribute of values) {
      if (observedAttributes.has(attribute)) continue;
      observedAttributes.add(attribute);
      const previous = attribute.onUploadCallback;
      attribute.onUpload(() => {
        previous.call(attribute);
        if (disposed) return;
        uploadedVersions.set(attribute, attribute.version);
        uploadedThisFrame += attribute.array.byteLength;
      });
    }
    return group.visible ? pending : 0;
  };
  const consumePendingUploadBytes = () => {
    const value = uploadedThisFrame; uploadedThisFrame = 0; return value;
  };
  const invalidateUploads = () => { uploadedVersions = new WeakMap(); uploadedThisFrame = 0; };

  const write = (time: number) => {
    const counts = LAYER_COUNTS[profile];
    // The cloud sea: a ring of low banks just beyond the returned land.
    for (let i = 0; i < counts.lowClouds; i++) {
      const angle = i / counts.lowClouds * Math.PI * 2 + unit(i) * .4 + time * .004;
      const radius = span * (.6 + unit(i + 31) * .62);
      const size = span * (.032 + unit(i + 57) * .03);
      position.set(centerX + Math.sin(angle) * radius, -4 - unit(i + 7) * 2.6, centerZ + Math.cos(angle) * radius);
      matrix.compose(position, quaternion.setFromEuler(euler.set(0, angle * 1.7, 0)), scale.set(size * 1.5, size * .9, size));
      clouds.setMatrixAt(i, matrix);
    }
    // A few high clouds drift slowly across the edges, never parked over the keep.
    for (let i = 0; i < counts.highClouds; i++) {
      const lane = (unit(i + 101) - .5) * span * 1.4; const travel = ((time * (.18 + unit(i + 13) * .12) * span / 60 + unit(i + 3) * span * 2) % (span * 2.4)) - span * 1.2;
      const side = i % 2 === 0 ? 1 : -1;
      position.set(centerX + travel, span * (.22 + unit(i + 71) * .08), centerZ + side * (span * .55 + Math.abs(lane) * .35));
      const size = span * (.035 + unit(i + 37) * .025);
      matrix.compose(position, quaternion.setFromEuler(euler.set(0, unit(i + 5) * 6.28, 0)), scale.set(size * 1.8, size * .6, size));
      clouds.setMatrixAt(counts.lowClouds + i, matrix);
    }
    clouds.count = counts.lowClouds + counts.highClouds;
    for (let i = 0; i < counts.birds; i++) {
      const flock = i % 3; const radius = span * (.08 + unit(i + 211) * .08);
      const cx = centerX + (flock - 1) * span * .28; const cz = centerZ + (flock === 1 ? -span * .2 : span * .12);
      const angle = time * (.35 + unit(i + 17) * .2) + i * 1.7;
      position.set(cx + Math.cos(angle) * radius, span * (.07 + unit(i + 19) * .03) + Math.sin(time * .8 + i) * .2, cz + Math.sin(angle) * radius);
      // Small swallows (about a third of a cell across) flapping by wing flip.
      matrix.compose(position, quaternion.setFromEuler(euler.set(0, -angle, Math.sin(angle) * .3)), scale.set(.45, .45 * Math.cos(time * 10 + i * 1.3), .45));
      birds.setMatrixAt(i, matrix);
    }
    birds.count = roosting ? 0 : counts.birds;
    clouds.instanceMatrix.needsUpdate = true; birds.instanceMatrix.needsUpdate = true;
    birds.visible = birds.count > 0;
  };
  write(0);
  return Object.freeze({
    group,
    maximumUploadBytes: greaterRealmGeometryBytes(cloudGeometry) + greaterRealmGeometryBytes(birdShape)
      + clouds.instanceMatrix.array.byteLength + birds.instanceMatrix.array.byteLength,
    prepareForUpload, consumePendingUploadBytes, invalidateUploads,
    setFrame: (x, z, nextSpan) => {
      if (disposed || ![x, z, nextSpan].every(Number.isFinite) || nextSpan <= 0) return;
      centerX = x; centerZ = z; span = nextSpan; write(0);
    },
    configure: (nextProfile, nextReducedMotion) => { if (disposed) return; profile = nextProfile; reducedMotion = nextReducedMotion; write(0); },
    setDaylight: mood => {
      if (disposed) return;
      const night = Math.max(0, Math.min(1, Number.isFinite(mood.night) ? mood.night : 0));
      cloudMaterial.color.set('#ffffff').lerp(mood.hazeColor, .18 + night * .5);
      cloudMaterial.emissive.copy(cloudDayEmissive).lerp(mood.skyColor, .35 + night * .4);
      const nextRoosting = night > .5;
      if (nextRoosting !== roosting) { roosting = nextRoosting; write(0); }
    },
    update: elapsed => {
      if (disposed || reducedMotion || !Number.isFinite(elapsed)) return false;
      write(Math.max(0, elapsed)); return true;
    },
    drawCalls: () => disposed || !group.visible ? 0 : 1 + (LAYER_COUNTS[profile].birds > 0 ? 1 : 0),
    instanceCount: () => {
      if (disposed || !group.visible) return 0; const counts = LAYER_COUNTS[profile];
      return counts.lowClouds + counts.highClouds + counts.birds;
    },
    dispose: () => {
      if (disposed) return; disposed = true;
      clouds.dispose(); birds.dispose(); cloudGeometry.dispose(); birdShape.dispose(); cloudMaterial.dispose(); birdMaterial.dispose();
      invalidateUploads(); group.clear(); group.removeFromParent();
    },
  });
}
