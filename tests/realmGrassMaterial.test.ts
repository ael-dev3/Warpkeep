import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  createRealmGrassMaterial,
  injectRealmGrassFragmentShader,
  injectRealmGrassVertexShader,
  REALM_GRASS_CROSS_WIND_RATIO,
  REALM_GRASS_INTERACTION_TRANSITION_SECONDS,
  REALM_GRASS_MAX_PRIMARY_BEND,
  REALM_GRASS_MAX_WIND_SWAY,
  REALM_GRASS_SHADER_CACHE_KEY,
  REALM_GRASS_THREE_SHADER_CONTRACT
} from '../src/components/realm/createRealmGrassMaterial';

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
    const source = 'void main() {\n#include <begin_vertex>\n}';
    const injected = injectRealmGrassVertexShader(source);

    expect(injected).toContain('attribute float grassFlex;');
    expect(injected).toContain('uniform float uGrassTime;');
    expect(injected).toContain('modelMatrix * instanceMatrix');
    expect(injected).toContain(
      'mat2 grassLocalToWorldXZ = mat2(grassInstanceBasis[0].xz, grassInstanceBasis[2].xz);'
    );
    expect(injected).toContain('inverse(grassLocalToWorldXZ)');
    expect(injected).toContain('grassWorldToLocalXZ * grassWorldDirection');
    expect(injected).toContain('grassWorldToLocalXZ * grassWorldCrossDirection');
    expect(injected).toContain('transformed.xz += grassLocalDirection');
    expect(injected).toContain('transformed.xz += grassLocalCrossDirection');
    expect(injected).toContain('dot(grassWorldPosition.xz, grassWorldDirection)');
    expect(injected).not.toContain('transformed.xz += grassWorldDirection');
    expect(injected).toContain('pow(max(grassFlex, 0.0), 1.85)');
    expect(injected).not.toContain('transformed *= grassVisibleScale;');
    expect(injected).toContain('vGrassEdgeFade = clamp(grassEdgeFade, 0.0, 1.0);');
    expect(injected).toContain('clamp((grassPrimary + grassSecondary * 0.28)');
    expect(() => injectRealmGrassVertexShader('void main() {}'))
      .toThrow('REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
    expect(() => injectRealmGrassVertexShader(THREE.ShaderLib.standard.vertexShader)).not.toThrow();
    expect(() => injectRealmGrassFragmentShader(THREE.ShaderLib.standard.fragmentShader)).not.toThrow();
  });

  it('keeps standard-material behavior while interaction and wind are uniform-only updates', () => {
    const layer = createRealmGrassMaterial(0.78);

    expect(layer.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((layer.material as THREE.MeshStandardMaterial & { alphaHash?: boolean }).alphaHash).toBe(true);
    expect((layer.material as THREE.MeshStandardMaterial & { alphaToCoverage?: boolean }).alphaToCoverage).toBe(false);
    expect(layer.material.customProgramCacheKey()).toBe(REALM_GRASS_SHADER_CACHE_KEY);
    expect(REALM_GRASS_SHADER_CACHE_KEY).toContain('procedural-grass-v2');
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

  it('projects one world wind direction through yawed and scaled instance bases', () => {
    const worldDirection = new THREE.Vector2(0.78, 0.62).normalize();
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
