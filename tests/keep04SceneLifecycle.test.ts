import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createKeep04Scene } from '../src/components/keep04/createKeep04Scene';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';

afterEach(() => vi.restoreAllMocks());
const assets = (): InnerKeepRuntimeAssetBundle => ({ staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() });

it('emits one disposal event per scene-owned forest instance, without disposing borrowed assets', () => {
  const bundle = assets(); const scene = createKeep04Scene({ quality: 'balanced', reducedMotion: true, assets: bundle });
  const events: number[] = [];
  scene.scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.addEventListener('dispose', () => events.push(object.id)); });
  scene.dispose(); scene.dispose();
  expect(events).toHaveLength(2); expect(new Set(events).size).toBe(2);
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
