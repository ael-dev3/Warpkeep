import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  applyRealmForestWindMaterial,
  injectRealmForestWindVertexShader,
  REALM_FOREST_WIND_SHADER_CONTRACT
} from '../src/components/realm/createRealmForestWindMaterial';

describe('Living Realm forest wind material', () => {
  it('injects one root-weighted world gust into the existing material', () => {
    const injected = injectRealmForestWindVertexShader(
      'void main() {\n#include <begin_vertex>\n}'
    );
    expect(injected).toContain('attribute float realmForestWindWeight');
    expect(injected).toContain('float realmLivingGust');
    expect(injected).toContain('realmForestRootedWeight');
    expect(injected).toContain('modelMatrix * instanceMatrix');
    expect(injected).toContain('transformed.xz +=');
    expect(() => injectRealmForestWindVertexShader('void main() {}'))
      .toThrow('REALM_FOREST_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED');
  });

  it('advances a uniform only and fails closed to the standard material', () => {
    const material = new THREE.MeshStandardMaterial();
    const controller = applyRealmForestWindMaterial(material, true);
    expect(material.customProgramCacheKey()).toBe(REALM_FOREST_WIND_SHADER_CONTRACT);
    expect(controller.setTime(2)).toBe(true);
    expect(controller.setTime(2)).toBe(false);

    const shader = { vertexShader: 'void main() {}', fragmentShader: '', uniforms: {} };
    expect(() => material.onBeforeCompile(
      shader as Parameters<typeof material.onBeforeCompile>[0],
      {} as THREE.WebGLRenderer
    )).not.toThrow();
    expect(controller.isActive()).toBe(false);
    expect(controller.getTelemetry()).toMatchObject({
      enabled: true,
      fallbackActive: true,
      fallbackCount: 1,
      fallbackReason: 'REALM_FOREST_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED'
    });
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    material.dispose();
  });

  it('does not install moving presentation when disabled', () => {
    const material = new THREE.MeshStandardMaterial();
    const controller = applyRealmForestWindMaterial(material, false);
    expect(controller.isActive()).toBe(false);
    expect(controller.setTime(1)).toBe(false);
    expect(material.userData.realmForestWindEnabled).toBe(false);
    material.dispose();
  });
});
