import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Building04 } from '../../../spacetimedb/gameplay04/policy';
import type { InnerKeepRuntimePrefab } from '../inner-keep/loadInnerKeepRuntimeAssets';
import { KEEP04_VISUAL_PROFILE as P, type Quality04 } from './keep04VisualProfile';

// Exact policy footprint dimensions in presentation metres. This never decides legality.
export const KEEP04_FOOTPRINTS: Readonly<Record<Building04, readonly [number, number]>> = {
  'city-mill': [11.3, 9.5], 'lumber-camp': [10.6, 8.8], 'city-stoneworks': [11, 9.2],
  'city-goldworks': [11, 9.2], 'city-barracks': [18.5, 15.5], 'grand-covenant-cathedral': [37, 32.02],
};
// Model-only hierarchy: the cathedral's precinct and placement stay full-sized.
const CATHEDRAL_BODY_SCALE = .75;

/** Unique buffer storage and decoded texture/mip allocation, plus graph submissions.
 * Does not claim GPU-driver allocation precision or count shadow passes.
 */
export function measureKeep04Object(root: THREE.Object3D) {
  const buffers = new Set<THREE.BufferAttribute | THREE.InterleavedBuffer>(); const textures = new Set<THREE.Texture>();
  let drawCalls = 0; let triangles = 0; let geometryBytes = 0; let textureBytes = 0;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const geometry = object.geometry; const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
    const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
    triangles += count / 3 * instances;
    drawCalls += Array.isArray(object.material) ? geometry.groups.length : 1;
    const attributes: Array<THREE.BufferAttribute | THREE.InterleavedBufferAttribute> = [...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes).flat()] as Array<THREE.BufferAttribute | THREE.InterleavedBufferAttribute>;
    if (geometry.index) attributes.push(geometry.index);
    if (object instanceof THREE.InstancedMesh) { attributes.push(object.instanceMatrix); if (object.instanceColor) attributes.push(object.instanceColor); }
    for (const attribute of attributes) {
      const buffer = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data : attribute;
      if (!buffers.has(buffer)) { buffers.add(buffer); geometryBytes += buffer.array.byteLength; }
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) {
    const image = texture.image as { width?: number; height?: number; depth?: number; data?: ArrayBufferView } | undefined;
    const width = image?.width ?? 0; const height = image?.height ?? 0; const depth = image?.depth ?? 1;
    if (![width, height, depth].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError('Non-finite keep texture.');
    if (texture.mipmaps.length && texture instanceof THREE.CompressedTexture) {
      textureBytes += texture.mipmaps.reduce((sum, mip) => sum + mip.data.byteLength, 0);
    } else {
      const channels = texture.format === THREE.RedFormat ? 1 : texture.format === THREE.RGFormat ? 2 : 4;
      const componentBytes = texture.type === THREE.FloatType ? 4 : texture.type === THREE.HalfFloatType ? 2 : 1;
      let w = width; let h = height;
      while (w > 0 && h > 0) {
        textureBytes += w * h * depth * channels * componentBytes;
        if (!texture.generateMipmaps || (w === 1 && h === 1)) break;
        w = Math.max(1, Math.floor(w / 2)); h = Math.max(1, Math.floor(h / 2));
      }
    }
  }
  if (![drawCalls, triangles, geometryBytes, textureBytes].every(Number.isFinite)) throw new RangeError('Invalid keep geometry allocation.');
  return { drawCalls, triangles, geometryBytes, textureBytes, uploadBytes: geometryBytes + textureBytes };
}

export type Keep04Building = Readonly<{ root: THREE.Group; fallback: boolean; dispose: () => void }>;
export function createKeep04Building(options: Readonly<{
  kind: Building04; level: number; constructing: boolean; quality: Quality04; prefab?: InnerKeepRuntimePrefab;
}>): Keep04Building {
  const { kind, constructing, quality } = options; const level = Math.max(0, Math.min(5, Math.trunc(options.level)));
  const [width, depth] = KEEP04_FOOTPRINTS[kind];
  const root = new THREE.Group(); root.name = `building:${kind}`;
  const ownedGeometries = new Set<THREE.BufferGeometry>(); const ownedMaterials = new Set<THREE.Material>();
  const parts: THREE.BufferGeometry[] = []; let disposed = false;
  function part(geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, ry = 0) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry; if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute('uv'); flat.rotateY(ry); flat.translate(x, y, z);
    const c = new THREE.Color(color); const colors = new Float32Array(flat.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(flat);
  }
  const box = (w: number, h: number, d: number, color: string, x = 0, y = h / 2, z = 0) => part(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const cone = (r: number, h: number, color: string, x: number, y: number, z: number, sides = 4) => part(new THREE.ConeGeometry(r, h, sides), color, x, y, z, Math.PI / 4);
  let prefabUsed = false;
  if (!constructing && options.prefab) {
    const model = options.prefab.clone(); const materialCopies = new Map<THREE.Material, THREE.Material>();
    const bounds = new THREE.Box3().setFromObject(model); const size = bounds.getSize(new THREE.Vector3());
    if ([size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0)) {
      // Uniform scaling preserves authored proportions and leaves decoration clearance.
      const scale = Math.min((width - 1.2) / size.x, (depth - 1.2) / size.z)
        * (kind === 'grand-covenant-cathedral' ? CATHEDRAL_BODY_SCALE : 1);
      const center = bounds.getCenter(new THREE.Vector3()); model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
      const normalized = new THREE.Group(); normalized.add(model); normalized.scale.setScalar(scale);
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const tint = (material: THREE.Material) => {
          let copy = materialCopies.get(material);
          if (!copy) {
            copy = material.clone(); materialCopies.set(material, copy); ownedMaterials.add(copy);
            if (copy instanceof THREE.MeshStandardMaterial) { copy.color.multiply(new THREE.Color(P.masonry).lerp(new THREE.Color('#ffffff'), 0.65)); copy.roughness = Math.max(0.75, copy.roughness); }
          }
          return copy;
        };
        object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
        object.castShadow = quality === 'high'; object.receiveShadow = true;
      });
      normalized.name = `prefab:${kind}`; root.add(normalized); prefabUsed = true;
    }
  }
  if (constructing) {
    root.name = `building:${kind}`;
    const marker = new THREE.Group(); marker.name = `project:${kind}`; root.add(marker);
    box(width - 0.25, 0.16, depth - 0.25, P.masonry);
    for (const x of [-width / 2 + 0.45, width / 2 - 0.45]) for (const z of [-depth / 2 + 0.45, depth / 2 - 0.45]) box(0.28, 4, 0.28, P.timber, x, 2, z);
    for (const y of [1.2, 3.6]) {
      for (const z of [-depth / 2 + 0.45, depth / 2 - 0.45]) box(width - 0.65, 0.18, 0.22, P.timber, 0, y, z);
      for (const x of [-width / 2 + 0.45, width / 2 - 0.45]) box(0.22, 0.18, depth - 0.65, P.timber, x, y, 0);
    }
    box(width * 0.5, 1.2, depth * 0.5, P.masonry); box(0.7, 0.8, 0.7, '#ffd090', 1, 1.6, 1);
    const light = new THREE.PointLight('#ffb65c', 18, 9, 2); light.position.set(1, 2, 1); root.add(light);
  } else if (!prefabUsed) {
    const marker = new THREE.Group(); marker.name = `silhouette:${kind}`; root.add(marker);
    if (kind === 'city-mill') {
      part(new THREE.CylinderGeometry(1.7, 2.4, 5, 8), P.masonry, 0, 2.5, 0); cone(2.8, 2.5, P.roofTeal, 0, 6.25, 0, 8);
      box(7.8, 0.45, 0.25, P.timber, 0, 5, 2.5); box(0.45, 7.8, 0.25, P.masonry, 0, 5, 2.55);
    } else if (kind === 'lumber-camp') {
      box(5.8, 2.5, 4.6, P.timber); cone(4.4, 2.3, P.roofTeal, 0, 3.65, 0);
      for (let i = 0; i < 3; i++) box(5.5, 0.7, 0.7, P.timber, 0, 0.5 + i * 0.65, 3.2);
    } else if (kind === 'city-stoneworks') {
      box(5, 3, 4, P.masonry, -1, 1.5, -1); cone(3.8, 1.8, P.roofTeal, -1, 3.9, -1);
      for (const x of [-2.5, 0, 2.5]) box(1.9, 1.3, 1.9, P.masonry, x, 0.65, 2.8);
    } else if (kind === 'city-goldworks') {
      box(5.4, 3, 4.5, P.timber); cone(3.8, 2, P.roofTeal, 0, 4, 0);
      box(1.4, 7, 1.4, P.masonry, 2.8, 3.5, -1.5); box(2, 1.4, 1, '#e0a85a', 0, 0.7, 2.7);
    } else if (kind === 'city-barracks') {
      box(11, 4, 8, P.masonry); cone(7.5, 3, P.roofTeal, 0, 5.5, 0);
      for (const x of [-6.6, 6.6]) { box(3, 6.5, 3, P.masonry, x, 3.25, 0); cone(2.5, 2.4, P.roofTeal, x, 7.7, 0); }
    } else {
      box(11, 9, 22, P.masonry); box(24, 7, 8, P.masonry); cone(8.2, 5, P.roofTeal, 0, 11.5, 0);
      box(5, 16, 5, P.masonry, 0, 8, -8); cone(4.2, 12, P.roofTeal, 0, 22, -8);
      for (const x of [-8, 8]) cone(2.4, 7, P.warpViolet, x, 10.5, 0);
      // Only architecture exists in parts here; later precinct courses and signs
      // retain their original dimensions, as does the construction branch above.
      parts.forEach(geometry => geometry.scale(CATHEDRAL_BODY_SCALE, CATHEDRAL_BODY_SCALE, CATHEDRAL_BODY_SCALE));
    }
  }
  // Completed levels need to read from the keep camera even when an authored
  // prefab is available. These restrained masonry courses are a single merged
  // presentation layer: they stay inside the policy footprint, add no pick
  // targets, and cost nothing after construction because they are static.
  if (!constructing && level > 0) {
    const expression = new THREE.Group(); expression.name = `level-expression:${level}`; root.add(expression);
    const tierHeight = 0.12;
    for (let tier = 0; tier < level; tier++) {
      const inset = 0.7 + tier * 0.18;
      const widthInset = 1.4 + tier * 0.36;
      const depthInset = 1.4 + tier * 0.36;
      const y = tierHeight * (tier + 1) - tierHeight / 2;
      box(Math.max(1, width - widthInset), tierHeight, 0.18, P.masonry, 0, y, depth / 2 - inset);
      box(Math.max(1, width - widthInset), tierHeight, 0.18, P.masonry, 0, y, -depth / 2 + inset);
      box(0.18, tierHeight, Math.max(1, depth - depthInset), P.masonry, width / 2 - inset, y, 0);
      box(0.18, tierHeight, Math.max(1, depth - depthInset), P.masonry, -width / 2 + inset, y, 0);
    }
  }
  // Seven-segment mesh numerals: no browser canvas/texture dependency and no collision growth.
  const badge = new THREE.Group(); badge.name = `level-badge:${level}`; root.add(badge);
  const craft = !constructing && level > 0 && kind !== 'city-barracks' && kind !== 'grand-covenant-cathedral';
  const bx = -width * (craft ? .25 : .3); const bz = depth / 2 - .45; const by = craft ? 1.55 : 1.4;
  if (craft) {
    // Low craft signs share the existing merged decoration draw. Geometry makes
    // each resource distinct without recoloring a borrowed roof/wall mesh.
    box(3.8, 2.1, .18, P.masonry, bx, by, bz);
    box(3.6, 1.9, .06, P.timber, bx, by, bz + .12);
    const glyph = (geometry: THREE.BufferGeometry, color: string, x = 0, y = 0) => part(geometry, color, bx - .88 + x, by + y, bz + .28);
    const polygon = (points: readonly (readonly [number, number])[], color: string, x = 0, y = 0) => {
      const shape = new THREE.Shape(points.map(([px, py]) => new THREE.Vector2(px, py)));
      glyph(new THREE.ShapeGeometry(shape), color, x, y);
    };
    if (kind === 'city-mill') {
      glyph(new THREE.BoxGeometry(.1, 1.38, .06), '#e8c772', 0, -.04);
      for (const y of [-.35, .02, .39]) for (const side of [-1, 1]) {
        glyph(new THREE.PlaneGeometry(.28, .44).rotateZ(-side * .65), '#f0d58d', side * .21, y);
      }
    } else if (kind === 'lumber-camp') {
      for (const y of [-.44, 0, .44]) {
        glyph(new THREE.BoxGeometry(1.16, .32, .05), '#bd9166', .06, y);
        glyph(new THREE.CircleGeometry(.16, 8), '#ead1a1', -.52, y);
      }
    } else if (kind === 'city-stoneworks') {
      const stone = [[-.29, -.18], [-.21, -.25], [.22, -.25], [.3, -.12], [.26, .22], [-.23, .25]] as const;
      polygon(stone, '#d7e4da', -.34, -.29); polygon(stone, '#b8c8c1', .34, -.29); polygon(stone, '#e2e9db', 0, .31);
    } else {
      const ingot = [[-.6, -.22], [.6, -.22], [.44, .22], [-.44, .22]] as const;
      polygon(ingot, '#e9b753', 0, -.29); polygon(ingot, '#f5d486', 0, .29);
    }
  } else box(1.8, 1.8, .18, P.timber, bx, by, bz);
  const digits = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg'];
  const segments: Record<string, readonly [number, number, number, number]> = { a: [0, .58, .72, .14], b: [.36, .29, .14, .58], c: [.36, -.29, .14, .58], d: [0, -.58, .72, .14], e: [-.36, -.29, .14, .58], f: [-.36, .29, .14, .58], g: [0, 0, .72, .14] };
  for (const key of digits[level]) { const [x, y, w, h] = segments[key]; box(w, h, .06, P.masonry, bx + (craft ? .88 : 0) + x, by + y, bz + (craft ? .28 : .13)); }
  for (let i = 0; i < Math.max(0, level - 1); i++) {
    const marker = new THREE.Group(); marker.name = `pennant:${i + 1}`; root.add(marker);
    const x = width * 0.12 + i * .65; box(.1, 2.6, .1, P.timber, x, 1.3, bz - .2);
    box(.46, .8, .08, P.warpViolet, x + .23, 2.1, bz - .2);
  }
  const merged = mergeGeometries(parts); parts.forEach(part => part.dispose());
  if (merged) {
    ownedGeometries.add(merged); const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }); ownedMaterials.add(material);
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = quality === 'high'; mesh.receiveShadow = true; root.add(mesh);
  }
  return { root, fallback: !constructing && !prefabUsed, dispose: () => {
    if (disposed) return; disposed = true; root.removeFromParent(); ownedGeometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); root.clear();
  } };
}
