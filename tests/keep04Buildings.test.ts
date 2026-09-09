import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createKeep04Building, measureKeep04Object, KEEP04_FOOTPRINTS } from '../src/components/keep04/createKeep04Buildings';
import type { Building04 } from '../spacetimedb/gameplay04/policy';
import type { InnerKeepRuntimePrefab } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

const kinds: Building04[] = ['city-mill', 'lumber-camp', 'city-stoneworks', 'city-goldworks', 'city-barracks', 'grand-covenant-cathedral'];
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
