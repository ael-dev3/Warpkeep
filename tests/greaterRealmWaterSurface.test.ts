import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createGreaterRealmWaterSurface } from '../src/greater-realm/greaterRealmWaterSurface';

function compile(material: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader
  };
  material.onBeforeCompile(shader as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
  return shader;
}

describe('Greater Realm water surface', () => {
  it('keeps one lit standard surface with no textures or displaced geometry', () => {
    const surface = createGreaterRealmWaterSurface({ cellSize: 1, graphicsProfile: 'high' });
    const shader = compile(surface.material);
    expect(surface.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(surface.material.map).toBeNull();
    expect(surface.material.normalMap).toBeNull();
    expect(surface.material.displacementMap).toBeNull();
    expect(surface.material.fog).toBe(true);
    expect(surface.material.depthWrite).toBe(true);
    expect(shader.uniforms.greaterRealmWaterTime?.value).toBe(0);
    expect(shader.vertexShader).toContain(THREE.ShaderLib.standard.vertexShader.split('#include <begin_vertex>')[1]);
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    expect(shader.fragmentShader).toContain('#include <fog_fragment>');
    surface.material.dispose();
  });

  it('updates already compiled and subsequently recompiled materials from the same clock', () => {
    const surface = createGreaterRealmWaterSurface({ cellSize: 0.5, graphicsProfile: 'balanced' });
    surface.update(12);
    const before = compile(surface.material);
    expect(before.uniforms.greaterRealmWaterTime!.value).toBe(12);
    expect(before.uniforms.greaterRealmWaterInverseCellSize!.value).toBe(2);
    surface.update(18);
    const after = compile(surface.material);
    expect(before.uniforms.greaterRealmWaterTime!.value).toBe(18);
    expect(after.uniforms.greaterRealmWaterTime).toBe(before.uniforms.greaterRealmWaterTime);
    // Motion changes never dirty/recompile the material or vary transparency.
    expect(surface.material.version).toBe(0);
    expect(surface.material.opacity).toBe(0.86);
    surface.material.dispose();
  });

  it.each([NaN, Infinity, -1])('has a finite static fallback for time %s', (value) => {
    const surface = createGreaterRealmWaterSurface({ cellSize: value, graphicsProfile: 'reduced' });
    const shader = compile(surface.material);
    surface.update(value);
    expect(shader.uniforms.greaterRealmWaterTime!.value).toBe(0);
    expect(shader.uniforms.greaterRealmWaterInverseCellSize!.value).toBe(1);
    surface.material.dispose();
  });

  it('uses distinct cached programs for reduced and layered detail without changing their world clock', () => {
    const reduced = createGreaterRealmWaterSurface({ cellSize: 1, graphicsProfile: 'reduced' });
    const layered = createGreaterRealmWaterSurface({ cellSize: 1, graphicsProfile: 'balanced' });
    reduced.update(42);
    layered.update(42);
    const simple = compile(reduced.material);
    const detailed = compile(layered.material);
    expect(reduced.material.customProgramCacheKey()).not.toBe(layered.material.customProgramCacheKey());
    expect(simple.uniforms.greaterRealmWaterTime!.value).toBe(detailed.uniforms.greaterRealmWaterTime!.value);
    expect(simple.fragmentShader).not.toContain('float ripple =');
    expect(detailed.fragmentShader).toContain('float ripple =');
    reduced.material.dispose();
    layered.material.dispose();
  });

  it.each(['vertexShader', 'fragmentShader'] as const)('retains an unmodified standard fallback when %s has an unknown contract', (key) => {
    const surface = createGreaterRealmWaterSurface({ cellSize: 1, graphicsProfile: 'high' });
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    shader[key] = 'unknown shader contract';
    const before = structuredClone(shader);
    surface.material.onBeforeCompile(shader as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
    expect(shader).toEqual(before);
    surface.material.dispose();
  });
});
