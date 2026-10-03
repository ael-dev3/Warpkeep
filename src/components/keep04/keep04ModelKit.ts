import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A tiny low-poly modelling kit for code-authored Verdant Citadel models.
// Parts are flattened to non-indexed, vertex-coloured triangles so a whole
// family of models (cottages, walls, trees, people) merges into one draw call
// or one instanced batch. No textures, no network bytes, no per-frame work.

export const KEEP04_LIFE_PALETTE = Object.freeze({
  masonry: '#ddd6bd', masonryShade: '#bdb59c', plaster: '#ebe3cb', timber: '#5a4636', timberDark: '#3e3128',
  roofTeal: '#3f8380', roofTealDark: '#2f6664', roofSlate: '#5b6670', roofThatch: '#b89b5e', roofRust: '#8a5a41',
  warpViolet: '#8d6ac8', warpGlow: '#c7a6ff', gold: '#e2b85a', window: '#ffd690', stone: '#a29b89',
  trunk: '#5e4632', conifer: '#3d5b3e', coniferTip: '#4f7149', leaf: '#5f8146', leafLight: '#7d9b55',
  birchBark: '#e9e5d8', birchLeaf: '#8fae5d', poplar: '#46653f', bush: '#557243', rock: '#8e9087',
  wool: '#efebe0', hide: '#3a3430', skin: '#e2b896', hair: '#4a3626', cloth: '#f4efe4', legs: '#433a31',
  wheat: '#d9c17a', wheatDark: '#c4aa62', sprout: '#8cad59', sproutDark: '#789a4b', soil: '#7d6446', soilDark: '#6c553b',
  lavender: '#9a86c2', lavenderDark: '#86729f', hay: '#d4b866', water: '#5b9fa0', smoke: '#e9e6df',
});

type Vec3 = readonly [number, number, number];

export type Keep04Kit = Readonly<{
  /** Add a geometry part with a flat colour and optional local transform. */
  add: (geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, position?: Vec3, rotation?: Vec3, scale?: Vec3) => void;
  box: (w: number, h: number, d: number, color: THREE.ColorRepresentation, x?: number, y?: number, z?: number, ry?: number) => void;
  cylinder: (rTop: number, rBottom: number, h: number, sides: number, color: THREE.ColorRepresentation, x?: number, y?: number, z?: number) => void;
  cone: (r: number, h: number, sides: number, color: THREE.ColorRepresentation, x?: number, y?: number, z?: number, ry?: number) => void;
  blob: (r: number, color: THREE.ColorRepresentation, x?: number, y?: number, z?: number, scale?: Vec3, detail?: number) => void;
  /** Gabled roof prism, ridge along local X, eaves at y and ridge at y + h. */
  gable: (w: number, h: number, d: number, color: THREE.ColorRepresentation, x?: number, y?: number, z?: number, ry?: number) => void;
  /** Nest subsequent parts inside a placed sub-model. */
  push: (position: Vec3, rotationY?: number, scale?: number) => void;
  pop: () => void;
  partCount: () => number;
  /** Merge into one geometry and release the parts; returns null when empty. */
  build: () => THREE.BufferGeometry | null;
  dispose: () => void;
}>;

const scratchColor = new THREE.Color();

export function gableGeometry(w: number, h: number, d: number) {
  const x = w / 2; const z = d / 2;
  // Two sloped planes, two gable ends and a closed underside.
  const positions = new Float32Array([
    -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0,
    x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0,
    -x, 0, -z, -x, 0, z, -x, h, 0,
    x, 0, z, x, 0, -z, x, h, 0,
    -x, 0, -z, x, 0, -z, x, 0, z, -x, 0, -z, x, 0, z, -x, 0, z,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Per-vertex 0/1 mask marking window parts that light up after dusk. */
export const KEEP04_GLOW_ATTRIBUTE = 'keep04Glow';
export type Keep04GlowUniform = { value: number };

/**
 * A standard vertex-coloured material whose window parts (marked by the kit's
 * glow mask) add a warm emissive term scaled by one shared uniform. Daylight
 * drives the uniform; geometry, draw calls and picking are unchanged.
 */
export function keep04GlowMaterial(parameters: THREE.MeshStandardMaterialParameters, glow: Keep04GlowUniform) {
  const material = new THREE.MeshStandardMaterial(parameters);
  const glowColor = { value: new THREE.Color('#ffc977') };
  material.onBeforeCompile = shader => {
    shader.uniforms.keep04NightGlow = glow; shader.uniforms.keep04GlowColor = glowColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float ${KEEP04_GLOW_ATTRIBUTE};\nvarying float vKeep04Glow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvKeep04Glow = ${KEEP04_GLOW_ATTRIBUTE};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float keep04NightGlow;\nuniform vec3 keep04GlowColor;\nvarying float vKeep04Glow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += keep04GlowColor * vKeep04Glow * keep04NightGlow;');
  };
  material.customProgramCacheKey = () => 'keep04-night-glow';
  return material;
}

export function createKeep04Kit(options: Readonly<{ glowMask?: boolean }> = {}): Keep04Kit {
  const glowMask = options.glowMask === true; const windowColor = new THREE.Color(KEEP04_LIFE_PALETTE.window);
  const parts: THREE.BufferGeometry[] = [];
  const stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  const local = new THREE.Matrix4(); const quaternion = new THREE.Quaternion(); const euler = new THREE.Euler();
  const position = new THREE.Vector3(); const scaleVector = new THREE.Vector3();
  let released = false;
  function add(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, at: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
    if (released) { geometry.dispose(); throw new Error('Keep model kit already built.'); }
    let flat = geometry;
    if (geometry.index) { flat = geometry.toNonIndexed(); geometry.dispose(); }
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    local.compose(position.set(...at), quaternion.setFromEuler(euler.set(...rotation)), scaleVector.set(...scale));
    flat.applyMatrix4(local.premultiply(stack[stack.length - 1]));
    scratchColor.set(color);
    const count = flat.getAttribute('position').count; const colors = new Float32Array(count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = scratchColor.r; colors[i + 1] = scratchColor.g; colors[i + 2] = scratchColor.b; }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (glowMask) flat.setAttribute(KEEP04_GLOW_ATTRIBUTE, new THREE.BufferAttribute(new Uint8Array(count).fill(scratchColor.equals(windowColor) ? 255 : 0), 1, true));
    parts.push(flat);
  }
  const kit: Keep04Kit = {
    add,
    box: (w, h, d, color, x = 0, y = h / 2, z = 0, ry = 0) => add(new THREE.BoxGeometry(w, h, d), color, [x, y, z], [0, ry, 0]),
    cylinder: (rTop, rBottom, h, sides, color, x = 0, y = h / 2, z = 0) => add(new THREE.CylinderGeometry(rTop, rBottom, h, sides), color, [x, y, z]),
    cone: (r, h, sides, color, x = 0, y = h / 2, z = 0, ry = 0) => add(new THREE.ConeGeometry(r, h, sides), color, [x, y, z], [0, ry, 0]),
    blob: (r, color, x = 0, y = 0, z = 0, scale = [1, 1, 1], detail = 0) => add(new THREE.IcosahedronGeometry(r, detail), color, [x, y, z], [0, 0, 0], scale),
    gable: (w, h, d, color, x = 0, y = 0, z = 0, ry = 0) => add(gableGeometry(w, h, d), color, [x, y, z], [0, ry, 0]),
    push: (at, rotationY = 0, scale = 1) => {
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...at),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY), new THREE.Vector3(scale, scale, scale));
      stack.push(matrix.premultiply(stack[stack.length - 1]));
    },
    pop: () => { if (stack.length > 1) stack.pop(); },
    partCount: () => parts.length,
    build: () => {
      released = true;
      if (!parts.length) return null;
      const merged = mergeGeometries(parts, false); parts.forEach(part => part.dispose()); parts.length = 0;
      if (!merged) throw new Error('Keep model parts could not be merged.');
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      return merged;
    },
    dispose: () => { released = true; parts.forEach(part => part.dispose()); parts.length = 0; },
  };
  return kit;
}

/**
 * A soft, dark disc with vertex alpha that grounds a model on the meadow:
 * opaque-ish at the centre, fading to nothing at a unit radius. It replaces
 * missing shadow maps on balanced/reduced and softens the base on high.
 */
export function keep04ContactShadowGeometry(segments = 18) {
  const positions: number[] = [0, 0, 0]; const colors: number[] = [1, 1, 1, .5]; const indices: number[] = [];
  const rings: ReadonlyArray<readonly [number, number]> = [[.55, .3], [1, 0]];
  for (const [radius, alpha] of rings) for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius); colors.push(1, 1, 1, alpha);
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(0, 1 + next, 1 + i);
    const a = 1 + i; const b = 1 + next; const c = 1 + segments + i; const d = 1 + segments + next;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

export function keep04ContactShadowMaterial() {
  return new THREE.MeshBasicMaterial({ color: '#1b261d', vertexColors: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
}

/** Build one geometry from a kit recipe, releasing parts when the recipe throws. */
export function buildKeep04Model(recipe: (kit: Keep04Kit) => void): THREE.BufferGeometry {
  const kit = createKeep04Kit();
  try {
    recipe(kit);
    const geometry = kit.build();
    if (!geometry) throw new Error('Empty keep model recipe.');
    return geometry;
  } catch (error) { kit.dispose(); throw error; }
}

export function triangleCount(geometry: THREE.BufferGeometry) {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}
