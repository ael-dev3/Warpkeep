import * as THREE from 'three';

// Tiny, readable world actors for the Greater Realm. Each streamed chunk
// uploads its own copy, so every shape stays a few dozen flat-shaded,
// vertex-coloured triangles: a villager with a head, a rabbit with ears and a
// sailing boat, instead of an anonymous cylinder or box.

type Part = Readonly<{ geometry: THREE.BufferGeometry; color: string; at?: readonly [number, number, number]; rotation?: readonly [number, number, number]; scale?: readonly [number, number, number] }>;

function assemble(parts: readonly Part[]) {
  const positions: number[] = []; const normals: number[] = []; const colors: number[] = [];
  const matrix = new THREE.Matrix4(); const color = new THREE.Color();
  for (const part of parts) {
    let geometry = part.geometry;
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    matrix.compose(new THREE.Vector3(...(part.at ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(...(part.scale ?? [1, 1, 1])));
    geometry.applyMatrix4(matrix); geometry.computeVertexNormals();
    positions.push(...(geometry.getAttribute('position').array as Float32Array));
    normals.push(...(geometry.getAttribute('normal').array as Float32Array));
    color.set(part.color);
    for (let i = 0; i < geometry.getAttribute('position').count; i++) colors.push(color.r, color.g, color.b);
    geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** About 0.42 world units tall: legs, tunic, head and hat; origin at the feet. */
export function greaterRealmVillagerGeometry() {
  return assemble([
    { geometry: new THREE.BoxGeometry(.11, .15, .07), color: '#463b31', at: [0, .075, 0] },
    { geometry: new THREE.ConeGeometry(.095, .21, 4), color: '#f2ece0', at: [0, .25, 0], rotation: [0, Math.PI / 4, 0] },
    { geometry: new THREE.OctahedronGeometry(.055, 0), color: '#e1b893', at: [0, .385, 0] },
    { geometry: new THREE.ConeGeometry(.06, .05, 4), color: '#4f3b2b', at: [0, .435, 0], rotation: [0, Math.PI / 4, 0] },
  ]);
}

/** A sitting rabbit, about 0.18 world units long. */
export function greaterRealmRabbitGeometry() {
  return assemble([
    { geometry: new THREE.OctahedronGeometry(.06, 0), color: '#b8a588', at: [0, .055, 0], scale: [1, .8, 1.35] },
    { geometry: new THREE.OctahedronGeometry(.038, 0), color: '#c4b394', at: [0, .1, .065] },
    { geometry: new THREE.TetrahedronGeometry(.03, 0), color: '#d8cbb2', at: [-.016, .15, .055], scale: [.45, 1.6, .45] },
    { geometry: new THREE.TetrahedronGeometry(.03, 0), color: '#d8cbb2', at: [.016, .15, .055], scale: [.45, 1.6, .45] },
  ]);
}

/**
 * A small single-sail river boat, bow toward local +z. Like the previous box
 * hull, the hull is centred on the origin so existing lane lifts still rest it
 * on the rendered water plane.
 */
export function greaterRealmBoatGeometry() {
  return assemble([
    { geometry: new THREE.BoxGeometry(.11, .045, .26), color: '#6d5139', at: [0, 0, 0] },
    { geometry: new THREE.BoxGeometry(.012, .2, .012), color: '#3e3128', at: [0, .118, .01] },
    { geometry: new THREE.PlaneGeometry(.13, .15), color: '#efe7d4', at: [0, .128, .03], rotation: [0, Math.PI / 2, 0] },
    { geometry: new THREE.PlaneGeometry(.13, .15), color: '#efe7d4', at: [0, .128, .03], rotation: [0, -Math.PI / 2, 0] },
  ]);
}

/** Exact uploaded bytes for a geometry (all attributes plus index). */
export function greaterRealmGeometryBytes(geometry: THREE.BufferGeometry) {
  let bytes = 0;
  for (const attribute of Object.values(geometry.attributes)) bytes += (attribute.array as ArrayBufferView).byteLength;
  if (geometry.index) bytes += (geometry.index.array as ArrayBufferView).byteLength;
  return bytes;
}

/** Gentle clothing variety for villagers; tints multiply the baked colours. */
export const GREATER_REALM_VILLAGER_TINTS = Object.freeze(['#ffffff', '#f6dfc8', '#d6e2f7', '#e4f3d6', '#f3d9e8', '#ece6cf'] as const);
