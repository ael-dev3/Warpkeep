import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createRealmEnvironmentDepth,
  sampleRealmSkyGradient
} from '../src/components/realm/createRealmEnvironment';

describe('Realm procedural environment depth', () => {
  it('samples a deterministic bounded horizon-to-zenith gradient', () => {
    const lower = sampleRealmSkyGradient(-1);
    const horizon = sampleRealmSkyGradient(-0.04);
    const upper = sampleRealmSkyGradient(0.34);
    const zenith = sampleRealmSkyGradient(1);

    for (const colour of [lower, horizon, upper, zenith]) {
      expect(Object.values(colour).every((channel) => channel >= 0 && channel <= 1)).toBe(true);
    }
    expect(sampleRealmSkyGradient(Number.NaN)).toEqual(sampleRealmSkyGradient(0));
    expect(lower).not.toEqual(horizon);
    expect(horizon).not.toEqual(upper);
    expect(upper).not.toEqual(zenith);
  });

  it('builds deterministic static domes and releases their GPU resources once', () => {
    const first = createRealmEnvironmentDepth('high');
    const second = createRealmEnvironmentDepth('high');
    const reduced = createRealmEnvironmentDepth('reduced');
    const firstDome = first.group.getObjectByName('realm-procedural-sky-dome') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >;
    const secondDome = second.group.getObjectByName('realm-procedural-sky-dome') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >;
    const reducedDome = reduced.group.getObjectByName('realm-procedural-sky-dome') as THREE.Mesh;

    expect(firstDome).toBeTruthy();
    expect(Array.from(firstDome.geometry.getAttribute('color').array)).toEqual(
      Array.from(secondDome.geometry.getAttribute('color').array)
    );
    expect(reducedDome.geometry.getAttribute('position').count)
      .toBeLessThan(firstDome.geometry.getAttribute('position').count);
    expect(firstDome.material.side).toBe(THREE.BackSide);
    expect(firstDome.material.depthWrite).toBe(false);
    expect(firstDome.material.fog).toBe(false);
    expect(firstDome.material.toneMapped).toBe(false);
    expect(firstDome.frustumCulled).toBe(false);

    const disposeGeometry = vi.spyOn(firstDome.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(firstDome.material, 'dispose');
    first.dispose();
    first.dispose();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    second.dispose();
    reduced.dispose();
  });
});
