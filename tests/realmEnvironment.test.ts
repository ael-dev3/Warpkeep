import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createRealmEnvironmentDepth,
  REALM_SUN_DIRECTION,
  REALM_SUN_LIGHT_POSITION,
  sampleRealmSkyGradient
} from '../src/components/realm/createRealmEnvironment';
import { REALM_ENVIRONMENT_SPECS } from '../src/components/realm/realmQuality';
import { GENESIS_WATER_SUN_DIRECTION_MICRO } from '../spacetimedb/src/waterWorld';

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
    const firstSun = first.group.getObjectByName('realm-procedural-sun-disc') as THREE.Mesh<
      THREE.CircleGeometry,
      THREE.MeshBasicMaterial
    >;

    expect(firstDome).toBeTruthy();
    expect(firstSun).toBeTruthy();
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
    const visibleSunDirection = firstSun.position.clone().normalize();
    expect(visibleSunDirection.x).toBeCloseTo(REALM_SUN_DIRECTION.x, 12);
    expect(visibleSunDirection.y).toBeCloseTo(REALM_SUN_DIRECTION.y, 12);
    expect(visibleSunDirection.z).toBeCloseTo(REALM_SUN_DIRECTION.z, 12);
    expect(firstSun.material.depthTest).toBe(false);
    expect(firstSun.material.depthWrite).toBe(false);
    expect(firstSun.material.toneMapped).toBe(false);
    expect(firstSun.frustumCulled).toBe(false);

    const disposeGeometry = vi.spyOn(firstDome.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(firstDome.material, 'dispose');
    const disposeSunGeometry = vi.spyOn(firstSun.geometry, 'dispose');
    const disposeSunMaterial = vi.spyOn(firstSun.material, 'dispose');
    const disposeEnvironmentMap = vi.spyOn(first.environmentMap, 'dispose');
    first.dispose();
    first.dispose();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(disposeSunGeometry).toHaveBeenCalledOnce();
    expect(disposeSunMaterial).toHaveBeenCalledOnce();
    expect(disposeEnvironmentMap).toHaveBeenCalledOnce();
    second.dispose();
    reduced.dispose();
  });

  it('generates deterministic, quality-bounded equirectangular environment maps', () => {
    const high = createRealmEnvironmentDepth('high');
    const highAgain = createRealmEnvironmentDepth('high');
    const balanced = createRealmEnvironmentDepth('balanced');
    const reduced = createRealmEnvironmentDepth('reduced');

    for (const [quality, environment] of [
      ['high', high],
      ['balanced', balanced],
      ['reduced', reduced]
    ] as const) {
      const spec = REALM_ENVIRONMENT_SPECS[quality];
      expect(environment.environmentMap).toBeInstanceOf(THREE.DataTexture);
      expect(environment.environmentMap.image.width).toBe(spec.textureWidth);
      expect(environment.environmentMap.image.height).toBe(spec.textureHeight);
      expect(environment.environmentMap.image.data).toHaveLength(
        spec.textureWidth * spec.textureHeight * 4
      );
      expect(environment.environmentMap.mapping).toBe(THREE.EquirectangularReflectionMapping);
      expect(environment.environmentMap.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(environment.environmentMap.generateMipmaps).toBe(false);
      expect(environment.environmentIntensity).toBe(spec.environmentIntensity);
    }

    const highData = high.environmentMap.image.data!;
    const highAgainData = highAgain.environmentMap.image.data!;
    const balancedData = balanced.environmentMap.image.data!;
    const reducedData = reduced.environmentMap.image.data!;
    expect(Array.from(highData)).toEqual(Array.from(highAgainData));
    expect(reducedData.length).toBeLessThan(balancedData.length);
    expect(balancedData.length).toBeLessThan(highData.length);

    high.dispose();
    highAgain.dispose();
    balanced.dispose();
    reduced.dispose();
  });

  it('aligns the generated reflection highlight with the visible sun direction', () => {
    const environment = createRealmEnvironmentDepth('high');
    const width = environment.environmentMap.image.width;
    const height = environment.environmentMap.image.height;
    const data = environment.environmentMap.image.data!;
    let brightestPixel = 0;
    let brightestLuminance = -1;

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      const luminance = data[offset] * 0.2126
        + data[offset + 1] * 0.7152
        + data[offset + 2] * 0.0722;
      if (luminance > brightestLuminance) {
        brightestLuminance = luminance;
        brightestPixel = pixel;
      }
    }

    const x = brightestPixel % width;
    const y = Math.floor(brightestPixel / width);
    const latitude = (((y + 0.5) / height) - 0.5) * Math.PI;
    const longitude = (((x + 0.5) / width) - 0.5) * Math.PI * 2;
    const highlightDirection = new THREE.Vector3(
      Math.cos(latitude) * Math.cos(longitude),
      Math.sin(latitude),
      Math.cos(latitude) * Math.sin(longitude)
    );
    const sunDirection = new THREE.Vector3(
      REALM_SUN_DIRECTION.x,
      REALM_SUN_DIRECTION.y,
      REALM_SUN_DIRECTION.z
    );

    expect(THREE.MathUtils.radToDeg(highlightDirection.angleTo(sunDirection))).toBeLessThan(2);
    environment.dispose();
  });

  it('aligns the visible light with the public fixed-point environment vector', () => {
    const authoritative = new THREE.Vector3(
      GENESIS_WATER_SUN_DIRECTION_MICRO.x,
      GENESIS_WATER_SUN_DIRECTION_MICRO.y,
      GENESIS_WATER_SUN_DIRECTION_MICRO.z
    ).normalize();
    const visible = new THREE.Vector3(
      REALM_SUN_LIGHT_POSITION.x,
      REALM_SUN_LIGHT_POSITION.y,
      REALM_SUN_LIGHT_POSITION.z
    ).normalize();

    expect(THREE.MathUtils.radToDeg(visible.angleTo(authoritative))).toBeLessThan(0.000001);
    expect(visible.x).toBeCloseTo(REALM_SUN_DIRECTION.x, 12);
    expect(visible.y).toBeCloseTo(REALM_SUN_DIRECTION.y, 12);
    expect(visible.z).toBeCloseTo(REALM_SUN_DIRECTION.z, 12);
  });
});
