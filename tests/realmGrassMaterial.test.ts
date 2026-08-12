import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  createRealmGrassMaterial,
  injectRealmGrassFragmentShader,
  injectRealmGrassVertexShader,
  REALM_GRASS_CROSS_WIND_RATIO,
  REALM_GRASS_INTERACTION_TRANSITION_SECONDS,
  REALM_GRASS_MAX_DISTURBANCE_SWAY,
  REALM_GRASS_MAX_PRIMARY_BEND,
  REALM_GRASS_MAX_WIND_SWAY,
  REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS,
  REALM_GRASS_NORMAL_BEND_RESPONSE,
  REALM_GRASS_SHADER_CACHE_KEY,
  REALM_GRASS_THREE_SHADER_CONTRACT
} from '../src/components/realm/createRealmGrassMaterial';
import { REALM_SUN_DIRECTION } from '../src/components/realm/createRealmEnvironment';
import { REALM_PREVAILING_WIND } from '../src/game/map/realmPrevailingWind';

function projectWorldDirectionIntoLocalXZ(
  worldDirection: THREE.Vector2,
  localToWorld: THREE.Matrix4
) {
  const elements = localToWorld.elements;
  const xx = elements[0]!;
  const xz = elements[2]!;
  const zx = elements[8]!;
  const zz = elements[10]!;
  const determinant = xx * zz - zx * xz;
  if (Math.abs(determinant) <= 0.000001) return worldDirection.clone();
  return new THREE.Vector2(
    (zz * worldDirection.x - zx * worldDirection.y) / determinant,
    (-xz * worldDirection.x + xx * worldDirection.y) / determinant
  );
}

function projectLocalDirectionIntoWorldXZ(
  localDirection: THREE.Vector2,
  localToWorld: THREE.Matrix4
) {
  const elements = localToWorld.elements;
  return new THREE.Vector2(
    elements[0]! * localDirection.x + elements[8]! * localDirection.y,
    elements[2]! * localDirection.x + elements[10]! * localDirection.y
  );
}

describe('procedural grass material contract', () => {
  it('injects world-space wind only at the pinned Three.js shader hook', () => {
    const source = 'void main() {\n#include <beginnormal_vertex>\n#include <begin_vertex>\n}';
    const injected = injectRealmGrassVertexShader(source);

    expect(injected).toContain('attribute vec4 grassBladeData;');
    expect(injected).not.toContain('attribute float grassFlex;');
    expect(injected).not.toContain('attribute float grassBladeVertical;');
    expect(injected).toContain('uniform float uGrassTime;');
    expect(injected).toContain('modelMatrix * instanceMatrix');
    expect(injected).toContain(
      'mat2 grassLocalToWorldXZ = mat2(grassInstanceBasis[0].xz, grassInstanceBasis[2].xz);'
    );
    expect(injected).toContain('inverse(grassLocalToWorldXZ)');
    expect(injected).toContain('grassWorldToLocalXZ * grassWorldDirection');
    expect(injected).toContain('grassWorldToLocalXZ * grassWorldCrossDirection');
    expect(injected).toContain('grassLocalDirection\n  + grassLocalCrossDirection');
    expect(injected).toContain('transformed.xz += grassLocalBend;');
    expect(injected).toContain('varying vec3 vGrassBendWorld;');
    expect(injected).toContain('vec2 grassLocalBend = (');
    expect(injected).toContain('mat3(modelMatrix * instanceMatrix)');
    expect(injected).toContain('dot(grassWorldPosition.xz, grassWorldDirection)');
    expect(injected).toContain('float realmLivingGust');
    expect(injected).toContain('float grassGust = mix(0.66, 1.0, realmLivingGust(');
    expect(injected).toContain('grassPhase * 0.18');
    expect(injected).not.toContain('transformed.xz += grassWorldDirection');
    expect(injected).toContain('float grassFlex = grassBladeData.y;');
    expect(injected).toContain('float grassBladeVertical = grassBladeData.y;');
    expect(injected).toContain('pow(max(grassFlex, 0.0), 1.85)');
    expect(injected).not.toContain('transformed *= grassVisibleScale;');
    expect(injected).toContain('vGrassEdgeFade = clamp(grassEdgeFade, 0.0, 1.0);');
    expect(injected).toContain('clamp((grassPrimary + grassSecondary * 0.28)');
    expect(() => injectRealmGrassVertexShader('void main() {}'))
      .toThrow('REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
    expect(() => injectRealmGrassFragmentShader([
      '#include <color_fragment>',
      '#include <alphahash_fragment>',
      '#include <normal_fragment_maps>'
    ].join('\n'))).toThrow('REALM_GRASS_SHADER_FRAGMENT_CONTRACT_CHANGED');
    expect(() => injectRealmGrassVertexShader(THREE.ShaderLib.standard.vertexShader)).not.toThrow();
    expect(() => injectRealmGrassFragmentShader(THREE.ShaderLib.standard.fragmentShader)).not.toThrow();
  });

  it('keeps standard-material behavior while interaction and wind are uniform-only updates', () => {
    const layer = createRealmGrassMaterial(0.78);

    expect(layer.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(layer.material.vertexColors).toBe(false);
    expect((layer.material as THREE.MeshStandardMaterial & { alphaHash?: boolean }).alphaHash).toBe(true);
    expect((layer.material as THREE.MeshStandardMaterial & { alphaToCoverage?: boolean }).alphaToCoverage).toBe(false);
    expect(layer.material.customProgramCacheKey()).toBe(REALM_GRASS_SHADER_CACHE_KEY);
    expect(REALM_GRASS_SHADER_CACHE_KEY).toContain('procedural-grass-v3');
    expect(REALM_GRASS_SHADER_CACHE_KEY).toContain('living-gust');
    expect(REALM_GRASS_SHADER_CACHE_KEY).toContain('bounded-tips');
    expect(REALM_GRASS_SHADER_CACHE_KEY).toContain('thin-blade-lighting-v1');
    expect(REALM_GRASS_SHADER_CACHE_KEY).toContain(REALM_GRASS_THREE_SHADER_CONTRACT);
    expect(layer.uniforms.uGrassWindStrength.value).toBeCloseTo(0.78);
    expect(layer.uniforms.uGrassWindDirection.value.toArray()).toEqual([
      REALM_PREVAILING_WIND.x,
      REALM_PREVAILING_WIND.z
    ]);
    expect(layer.uniforms.uGrassSunDirection.value.toArray()).toEqual([
      REALM_SUN_DIRECTION.x,
      REALM_SUN_DIRECTION.y,
      REALM_SUN_DIRECTION.z
    ]);
    expect(layer.uniforms.uGrassSunDirection.value.length()).toBeCloseTo(1, 12);
    expect(layer.getShaderTelemetry()).toEqual({
      fallbackActive: false,
      fallbackCount: 0,
      fallbackReason: null,
      disturbanceSlotCount: 0,
      activeDisturbanceCount: 0
    });
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

  it('fails closed to retained static standard grass when a shader marker drifts', () => {
    const layer = createRealmGrassMaterial(1);
    const shader = {
      vertexShader: 'void main() { gl_Position = vec4(0.0); }',
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {}
    };
    const compile = layer.material.onBeforeCompile as unknown as (
      shaderInput: typeof shader
    ) => void;

    expect(() => compile(shader)).not.toThrow();
    expect(shader.vertexShader).toBe('void main() { gl_Position = vec4(0.0); }');
    expect(shader.fragmentShader).toBe(THREE.ShaderLib.standard.fragmentShader);
    expect(layer.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(layer.material.visible).toBe(true);
    expect(layer.getShaderTelemetry()).toEqual({
      fallbackActive: true,
      fallbackCount: 1,
      fallbackReason: 'REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED',
      disturbanceSlotCount: 0,
      activeDisturbanceCount: 0
    });
    expect(layer.material.userData.realmGrassShaderFallbackActive).toBe(true);
    expect(layer.material.customProgramCacheKey()).toContain('static-fallback');
    expect(layer.setTime(1)).toBe(false);

    compile(shader);
    expect(layer.getShaderTelemetry().fallbackCount).toBe(1);
    layer.dispose();
  });

  it('uses exactly one stochastic coverage mode so MSAA does not square blade coverage', () => {
    const hashed = createRealmGrassMaterial(1, true, false);
    const multisampled = createRealmGrassMaterial(1, true, true);
    const hashedMaterial = hashed.material as THREE.MeshStandardMaterial & {
      alphaHash?: boolean;
      alphaToCoverage?: boolean;
    };
    const multisampledMaterial = multisampled.material as THREE.MeshStandardMaterial & {
      alphaHash?: boolean;
      alphaToCoverage?: boolean;
    };

    expect([hashedMaterial.alphaHash, hashedMaterial.alphaToCoverage]).toEqual([true, false]);
    expect([multisampledMaterial.alphaHash, multisampledMaterial.alphaToCoverage])
      .toEqual([false, true]);
    expect(hashed.material.userData.realmGrassAlphaHash).toBe(true);
    expect(hashed.material.userData.realmGrassAlphaToCoverage).toBe(false);
    expect(multisampled.material.userData.realmGrassAlphaHash).toBe(false);
    expect(multisampled.material.userData.realmGrassAlphaToCoverage).toBe(true);

    hashed.dispose();
    multisampled.dispose();
  });

  it('switches to the standard fallback after a renderer-level link failure', () => {
    const layer = createRealmGrassMaterial(1);
    const priorVersion = layer.material.version;

    layer.activateShaderFallback('REALM_GRASS_SHADER_COMPILE_OR_LINK_FAILED');

    expect(layer.getShaderTelemetry()).toEqual({
      fallbackActive: true,
      fallbackCount: 1,
      fallbackReason: 'REALM_GRASS_SHADER_COMPILE_OR_LINK_FAILED',
      disturbanceSlotCount: 0,
      activeDisturbanceCount: 0
    });
    expect(layer.material.version).toBeGreaterThan(priorVersion);
    expect(layer.material.customProgramCacheKey()).toContain('static-fallback');
    expect(layer.setTime(1)).toBe(false);
    layer.dispose();
  });

  it('clamps shader motion to the same maximum displacement used by active-layer bounds', () => {
    expect(REALM_GRASS_MAX_PRIMARY_BEND * Math.hypot(1, REALM_GRASS_CROSS_WIND_RATIO))
      .toBeCloseTo(REALM_GRASS_MAX_WIND_SWAY, 12);
    expect(REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS).toBeGreaterThanOrEqual(0.1);
    expect(REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS).toBeGreaterThan(
      (REALM_GRASS_MAX_WIND_SWAY + REALM_GRASS_MAX_DISTURBANCE_SWAY)
        * Math.hypot(1, 0.78)
    );
  });

  it('keeps normal bending restrained relative to the bounded blade displacement', () => {
    expect(REALM_GRASS_MAX_WIND_SWAY * REALM_GRASS_NORMAL_BEND_RESPONSE)
      .toBeLessThan(0.18);
  });

  it('unrolls only the configured disturbance slots and updates uniforms in place', () => {
    const layer = createRealmGrassMaterial(1, true, false, 4);
    const source = 'void main() {\n#include <beginnormal_vertex>\n#include <begin_vertex>\n}';
    const injected = injectRealmGrassVertexShader(source, 4);
    const centers = new Float32Array([1, 2, 3, 4, 0, 0, 0, 0]);
    const params = new Float32Array([0.7, 0.8, 0.25, 2, 1, 0.5, 0.5, 3, 0, 0, 0, 0, 0, 0, 0, 0]);

    expect(injected).toContain('uGrassDisturbanceCenters[4]');
    expect(injected).toContain('uGrassDisturbanceCount > 3');
    expect(injected).not.toContain('uGrassDisturbanceCount > 4');
    expect(layer.material.customProgramCacheKey()).toContain('disturbances-4');
    expect(layer.setDisturbances({ count: 2, centers, params })).toBe(true);
    expect(layer.uniforms.uGrassDisturbanceCount.value).toBe(2);
    expect(layer.uniforms.uGrassDisturbanceCenters.value[0]!.toArray()).toEqual([1, 2]);
    expect(layer.uniforms.uGrassDisturbanceParams.value[1]!.toArray()).toEqual([1, 0.5, 0.5, 3]);
    expect(layer.getShaderTelemetry().activeDisturbanceCount).toBe(2);
    layer.dispose();
  });

  it('projects one world wind direction through yawed and scaled instance bases', () => {
    const worldDirection = new THREE.Vector2(
      REALM_PREVAILING_WIND.x,
      REALM_PREVAILING_WIND.z
    );
    const worldCrossDirection = new THREE.Vector2(
      -worldDirection.y,
      worldDirection.x
    );
    const modelMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(4, 0, -7),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.31),
      new THREE.Vector3(1.4, 1, 0.72)
    );

    for (const yaw of [0, Math.PI / 3, Math.PI / 2, Math.PI, -Math.PI * 0.71]) {
      const instanceMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(2, 0, 5),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        new THREE.Vector3(0.08, 0.44, 0.13)
      );
      const localToWorld = modelMatrix.clone().multiply(instanceMatrix);

      for (const expectedWorldDirection of [worldDirection, worldCrossDirection]) {
        const localDirection = projectWorldDirectionIntoLocalXZ(
          expectedWorldDirection,
          localToWorld
        );
        const restoredWorldDirection = projectLocalDirectionIntoWorldXZ(
          localDirection,
          localToWorld
        );
        expect(restoredWorldDirection.x).toBeCloseTo(expectedWorldDirection.x, 10);
        expect(restoredWorldDirection.y).toBeCloseTo(expectedWorldDirection.y, 10);
      }
    }
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
