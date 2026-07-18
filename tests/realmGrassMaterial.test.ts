import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  createRealmGrassMaterial,
  injectRealmGrassVertexShader,
  REALM_GRASS_CROSS_WIND_RATIO,
  REALM_GRASS_INTERACTION_TRANSITION_SECONDS,
  REALM_GRASS_MAX_PRIMARY_BEND,
  REALM_GRASS_MAX_WIND_SWAY,
  REALM_GRASS_SHADER_CACHE_KEY,
  REALM_GRASS_THREE_SHADER_CONTRACT
} from '../src/components/realm/createRealmGrassMaterial';

describe('procedural grass material contract', () => {
  it('injects world-space wind only at the pinned Three.js shader hook', () => {
    const source = 'void main() {\n#include <begin_vertex>\n}';
    const injected = injectRealmGrassVertexShader(source);

    expect(injected).toContain('attribute float grassFlex;');
    expect(injected).toContain('uniform float uGrassTime;');
    expect(injected).toContain('modelMatrix * instanceMatrix');
    expect(injected).toContain('transformed.xz += grassDirection');
    expect(injected).toContain('pow(max(grassFlex, 0.0), 1.85)');
    expect(injected).toContain('transformed *= grassVisibleScale;');
    expect(injected).toContain('clamp((grassPrimary + grassSecondary * 0.28)');
    expect(() => injectRealmGrassVertexShader('void main() {}'))
      .toThrow('REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
    expect(() => injectRealmGrassVertexShader(THREE.ShaderLib.standard.vertexShader)).not.toThrow();
  });

  it('keeps standard-material behavior while interaction and wind are uniform-only updates', () => {
    const layer = createRealmGrassMaterial(0.78);

    expect(layer.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(layer.material.customProgramCacheKey()).toBe(REALM_GRASS_SHADER_CACHE_KEY);
    expect(REALM_GRASS_SHADER_CACHE_KEY).toContain(REALM_GRASS_THREE_SHADER_CONTRACT);
    expect(layer.uniforms.uGrassWindStrength.value).toBeCloseTo(0.78);
    expect(layer.setTime(1.25)).toBe(true);
    expect(layer.setTime(1.25)).toBe(false);
    expect(layer.uniforms.uGrassTime.value).toBe(1.25);

    layer.setInteraction({ q: 2, r: -1 }, { q: -3, r: 4 });
    expect(layer.uniforms.uGrassSelectedCell.value.toArray()).toEqual([2, -1]);
    expect(layer.uniforms.uGrassHoveredCell.value.toArray()).toEqual([-3, 4]);
    expect(layer.uniforms.uGrassInteractionProgress.value).toBe(0);
    layer.setTime(1.25 + REALM_GRASS_INTERACTION_TRANSITION_SECONDS / 2);
    expect(layer.uniforms.uGrassInteractionProgress.value).toBeCloseTo(0.5, 4);
    layer.setVisible(false);
    expect(layer.uniforms.uGrassGlobalVisibility.value).toBe(0);

    layer.dispose();
    expect(layer.setTime(2)).toBe(false);
  });

  it('clamps shader motion to the same maximum displacement used by active-layer bounds', () => {
    expect(REALM_GRASS_MAX_PRIMARY_BEND * Math.hypot(1, REALM_GRASS_CROSS_WIND_RATIO))
      .toBeCloseTo(REALM_GRASS_MAX_WIND_SWAY, 12);
  });

  it('settles selected and hovered flattening immediately when motion is reduced', () => {
    const layer = createRealmGrassMaterial(0, false);
    layer.setInteraction({ q: 1, r: 2 }, { q: 3, r: 4 });

    expect(layer.uniforms.uGrassInteractionProgress.value).toBe(1);
    expect(layer.uniforms.uGrassPreviousSelectedCell.value.toArray()).toEqual([1, 2]);
    expect(layer.uniforms.uGrassPreviousHoveredCell.value.toArray()).toEqual([3, 4]);
    layer.dispose();
  });
});
