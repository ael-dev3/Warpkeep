import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createKeep04Building, measureKeep04Object, KEEP04_FOOTPRINTS } from '../src/components/keep04/createKeep04Buildings';
import type { Building04 } from '../spacetimedb/gameplay04/policy';
import type { InnerKeepRuntimePrefab } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

const kinds: Building04[] = ['city-mill', 'lumber-camp', 'city-stoneworks', 'city-goldworks', 'city-barracks', 'grand-covenant-cathedral'];
const economy = kinds.slice(0, 4);
function frontVertices(building: ReturnType<typeof createKeep04Building>, depth: number) {
  const points: THREE.Vector3[] = [];
  building.root.updateMatrixWorld(true);
  building.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      if (point.z > depth / 2 - .4) points.push(point);
    }
  });
  return points;
}
it.each([1, 5])('gives the authored cathedral a smaller body at level %s without shrinking its precinct or modifying borrowed assets', level => {
  const geometry = new THREE.BoxGeometry(34, 31.5, 29.02); const material = new THREE.MeshStandardMaterial({ color: '#916dc8' });
  const source = new THREE.Group(); source.position.set(3, 2, -4); source.add(new THREE.Mesh(geometry, material)); source.updateMatrixWorld(true);
  const originalMatrix = source.matrixWorld.clone(); const originalPositions = geometry.getAttribute('position').array.slice();
  const prefab: InnerKeepRuntimePrefab = { id: 'grand-covenant-cathedral', root: source, clips: [], boundsMeters: [34, 31.5, 29.02], triangles: 12, drawCalls: 1, animated: false, mounted: false, clone: () => source.clone(true) };
  const building = createKeep04Building({ kind: 'grand-covenant-cathedral', level, constructing: false, quality: 'balanced', prefab });
  const body = building.root.getObjectByName('prefab:grand-covenant-cathedral')!;
  const bounds = new THREE.Box3().setFromObject(body); const size = bounds.getSize(new THREE.Vector3());
  expect(size.y).toBeLessThan(26); expect(size.y).toBeGreaterThan(24);
  expect(size.x / size.y).toBeCloseTo(34 / 31.5); expect(size.z / size.y).toBeCloseTo(29.02 / 31.5);
  expect(bounds.min.y).toBeCloseTo(0); expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
  const precinct = new THREE.Box3().setFromObject(building.root).getSize(new THREE.Vector3());
  // The existing outer course centers leave .7m, with .18m-wide strips.
  expect(precinct.x).toBeCloseTo(35.78, 4); expect(precinct.z).toBeGreaterThan(30);
  expect(building.root.scale.toArray()).toEqual([1, 1, 1]); expect(building.root.position.toArray()).toEqual([0, 0, 0]);
  expect(source.matrixWorld.equals(originalMatrix)).toBe(true); expect(geometry.getAttribute('position').array).toEqual(originalPositions);
  expect(material.color.getHexString()).toBe('916dc8');
  const borrowedGeometryDispose = vi.spyOn(geometry, 'dispose'); const borrowedMaterialDispose = vi.spyOn(material, 'dispose');
  expect(measureKeep04Object(building.root).drawCalls).toBe(2); building.dispose();
  expect(borrowedGeometryDispose).not.toHaveBeenCalled(); expect(borrowedMaterialDispose).not.toHaveBeenCalled();
  geometry.dispose(); material.dispose();
});
it('reduces fallback cathedral architecture while retaining full-size construction and precinct details', () => {
  const complete = createKeep04Building({ kind: 'grand-covenant-cathedral', level: 5, constructing: false, quality: 'reduced' });
  const project = createKeep04Building({ kind: 'grand-covenant-cathedral', level: 0, constructing: true, quality: 'reduced' });
  const body = new THREE.Box3().setFromObject(complete.root); const scaffold = new THREE.Box3().setFromObject(project.root);
  expect(body.max.y).toBeCloseTo(21); expect(body.getSize(new THREE.Vector3()).x).toBeCloseTo(35.78, 4);
  expect(scaffold.max.y).toBeCloseTo(4); expect(scaffold.getSize(new THREE.Vector3()).x).toBeCloseTo(36.75);
  expect(scaffold.getSize(new THREE.Vector3()).z).toBeCloseTo(31.77, 4);
  expect(measureKeep04Object(complete.root).drawCalls).toBe(1);
  complete.dispose(); project.dispose();
});
it.each(economy)('gives completed %s a broad low craft fascia in its existing merged decoration while preserving the construction badge', kind => {
  const [width, depth] = KEEP04_FOOTPRINTS[kind];
  const complete = createKeep04Building({ kind, level: 5, constructing: false, quality: 'reduced' });
  const project = createKeep04Building({ kind, level: 0, constructing: true, quality: 'reduced' });
  const fascia = new THREE.Box3().setFromPoints(frontVertices(complete, depth));
  const oldNumeral = new THREE.Box3().setFromPoints(frontVertices(project, depth).filter(point => point.z > depth / 2 - .3 && point.y > .4));
  expect(fascia.getSize(new THREE.Vector3()).x).toBeGreaterThan(3.5);
  expect(fascia.max.y).toBeLessThanOrEqual(2.7); expect(fascia.min.x).toBeGreaterThan(-width / 2);
  expect(fascia.max.z).toBeLessThan(depth / 2); expect(oldNumeral.getSize(new THREE.Vector3()).x).toBeCloseTo(.86, 4);
  expect(oldNumeral.getCenter(new THREE.Vector3()).x).toBeCloseTo(-width * .3, 4);
  expect(measureKeep04Object(complete.root)).toMatchObject({ drawCalls: 1, textureBytes: 0 });
  expect(measureKeep04Object(complete.root).triangles).toBeLessThan(1600);
  let lights = 0; const disposals: ReturnType<typeof vi.spyOn>[] = [];
  complete.root.traverse(object => {
    if (object instanceof THREE.Light) lights++;
    if (object instanceof THREE.Mesh) { disposals.push(vi.spyOn(object.geometry, 'dispose')); disposals.push(vi.spyOn(object.material as THREE.Material, 'dispose')); }
  });
  expect(lights).toBe(0); complete.dispose(); complete.dispose(); disposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce()); project.dispose();
});
it('gives the four economic crafts different geometric symbols while retaining their level numeral', () => {
  const symbols: string[] = [];
  for (const kind of economy) {
    const [width, depth] = KEEP04_FOOTPRINTS[kind];
    const building = createKeep04Building({ kind, level: 3, constructing: false, quality: 'reduced' });
    const points = frontVertices(building, depth).filter(point => point.z > depth / 2 - .2 && point.x < -width * .25);
    const symbol = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3());
    expect(symbol.x).toBeGreaterThan(.8); expect(symbol.y).toBeGreaterThan(1);
    symbols.push(JSON.stringify(points.map(point => [point.x + width * .25, point.y, point.z - depth / 2].map(value => Math.round(value * 1000)))));
    expect(building.root.getObjectByName('level-badge:3')).toBeDefined(); building.dispose();
  }
  expect(new Set(symbols).size).toBe(4);
});
for (const kind of kinds) it.each([1, 2, 3, 4, 5])(`${kind} level %s retains a distinct bounded silhouette and owns its disposal`, level => {
  const building = createKeep04Building({ kind, level, constructing: false, quality: 'reduced' });
  expect(building.root.getObjectByName(`silhouette:${kind}`)).toBeDefined();
  expect(building.root.getObjectByName(`level-expression:${level}`)).toBeDefined();
  expect(building.root.getObjectByName(`level-badge:${level}`)).toBeDefined();
  expect(building.root.children.filter(child => child.name.startsWith('pennant:'))).toHaveLength(level - 1);
  const size = new THREE.Box3().setFromObject(building.root).getSize(new THREE.Vector3());
  expect(size.x).toBeLessThanOrEqual(KEEP04_FOOTPRINTS[kind][0]);
  expect(size.z).toBeLessThanOrEqual(KEEP04_FOOTPRINTS[kind][1]);
  expect(measureKeep04Object(building.root).triangles).toBeLessThan(1600);
  const materials = new Set<THREE.Material>(); building.root.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
  expect(materials.size).toBeLessThanOrEqual(6);
  const spies = [...materials].map(m => vi.spyOn(m, 'dispose'));
  building.dispose(); building.dispose(); spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
});
for (const kind of kinds) it(`keeps authored ${kind} prefabs inside their footprint while expressing completed level`, () => {
  const geometry = new THREE.BoxGeometry(2, 3, 2); const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, material));
  const prefab: InnerKeepRuntimePrefab = { id: kind, root, clips: [], boundsMeters: [2, 3, 2], triangles: 12, drawCalls: 1, animated: false, mounted: false, clone: () => root.clone(true) };
  const building = createKeep04Building({ kind, level: 5, constructing: false, quality: 'reduced', prefab });
  const size = new THREE.Box3().setFromObject(building.root).getSize(new THREE.Vector3());
  expect(building.root.getObjectByName('prefab:' + kind)).toBeDefined();
  expect(building.root.getObjectByName('level-expression:5')).toBeDefined();
  if (economy.includes(kind)) expect(new THREE.Box3().setFromPoints(frontVertices(building, KEEP04_FOOTPRINTS[kind][1])).getSize(new THREE.Vector3()).x).toBeGreaterThan(3.5);
  expect(size.x).toBeLessThanOrEqual(KEEP04_FOOTPRINTS[kind][0]);
  expect(size.z).toBeLessThanOrEqual(KEEP04_FOOTPRINTS[kind][1]);
  building.dispose(); geometry.dispose(); material.dispose();
});
it('clones source materials but leaves bundle geometry and textures owned by the bundle', () => {
  const geometry = new THREE.BoxGeometry(2, 3, 2); const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, material));
  const prefab: InnerKeepRuntimePrefab = { id: 'city-mill', root, clips: [], boundsMeters: [2, 3, 2], triangles: 12, drawCalls: 1, animated: false, mounted: false, clone: () => root.clone(true) };
  const geometryDispose = vi.spyOn(geometry, 'dispose'); const materialDispose = vi.spyOn(material, 'dispose');
  const building = createKeep04Building({ kind: 'city-mill', level: 5, constructing: false, quality: 'high', prefab });
  expect(material.color.getHexString()).toBe('ffffff'); building.dispose();
  expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
  geometry.dispose(); material.dispose();
});
it('counts uploaded typed-array ranges, deduplicates shared attributes and includes every rectangular mip', () => {
  const storage = new Float32Array(300); const positions = new Float32Array(storage.buffer, 0, 9);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const texture = new THREE.DataTexture(new Uint8Array(64), 2, 8); texture.generateMipmaps = true;
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const group = new THREE.Group(); group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  expect(measureKeep04Object(group)).toMatchObject({ geometryBytes: 36, textureBytes: 92, uploadBytes: 128, triangles: 2, drawCalls: 2 });
  geometry.dispose(); material.dispose(); texture.dispose();
});
