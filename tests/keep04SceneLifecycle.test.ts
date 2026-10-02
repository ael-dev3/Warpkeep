import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createKeep04Scene } from '../src/components/keep04/createKeep04Scene';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

afterEach(() => vi.restoreAllMocks());
const assets = (): InnerKeepRuntimeAssetBundle => ({ staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() });

it('emits one disposal event per scene-owned instanced mesh, without disposing borrowed assets', () => {
  const bundle = assets(); const scene = createKeep04Scene({ quality: 'balanced', reducedMotion: true, assets: bundle });
  const events: Array<{ id: number; name: string }> = []; let owned = 0;
  scene.scene.traverse(object => { if (object instanceof THREE.InstancedMesh) { owned++; object.addEventListener('dispose', () => events.push({ id: object.id, name: object.name })); } });
  scene.dispose(); scene.dispose();
  // Every scene-owned batch, including the decorative vale and its life, disposes exactly once.
  expect(events).toHaveLength(owned); expect(new Set(events.map(event => event.id)).size).toBe(owned);
  const names = events.map(event => event.name);
  expect(names).toEqual(expect.arrayContaining(['forest-band:0', 'forest-band:1', 'forest-bank:perimeter', 'moat-water-edge']));
  // The building ground-contact and night-light batches belong to the scene itself.
  expect(names).toEqual(expect.arrayContaining(['building-contact-shadows', 'building-night-light']));
  expect(names.filter(name => !['forest-band:0', 'forest-band:1', 'forest-bank:perimeter', 'moat-water-edge', 'building-contact-shadows', 'building-night-light'].includes(name))
    .every(name => name.startsWith('keep04-vale-') || name.startsWith('keep04-life-'))).toBe(true);
  expect(names.some(name => name.startsWith('keep04-vale-'))).toBe(true); expect(names.some(name => name.startsWith('keep04-life-'))).toBe(true);
  expect(scene.scene.children).toHaveLength(0); expect(bundle.dispose).not.toHaveBeenCalled();
});

it('retires forest instances and allocated buffers when construction fails before attachment', () => {
  const events: number[] = []; const geometryEvents: number[] = [];
  const original = THREE.InstancedMesh.prototype.setMatrixAt;
  vi.spyOn(THREE.InstancedMesh.prototype, 'setMatrixAt').mockImplementation(function (this: THREE.InstancedMesh, index, matrix) {
    if (index === 0 && this.name.startsWith('forest-band:')) {
      this.addEventListener('dispose', () => events.push(this.id));
      this.geometry.addEventListener('dispose', () => geometryEvents.push(this.geometry.id));
      throw new Error('instance upload setup failed');
    }
    return original.call(this, index, matrix);
  });
  expect(() => createKeep04Scene({ quality: 'balanced', reducedMotion: false, assets: assets() })).toThrow('instance upload setup failed');
  expect(events).toHaveLength(1); expect(geometryEvents).toHaveLength(1);
});

it('rejects off-viewport rays even when the projected ground or building would be hit', () => {
  const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: true, assets: assets() });
  scene.camera.zoom = 10; scene.camera.updateProjectionMatrix();
  expect(scene.pickPlacement(1.1, 0, 'city-mill')).toBeNull();
  scene.dispose();
});
