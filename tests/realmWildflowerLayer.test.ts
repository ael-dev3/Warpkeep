import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createRealmWildflowerLayer, REALM_WILDFLOWER_BUDGETS } from '../src/components/realm/createRealmWildflowerLayer';
import { createRealmWildflowerMaterial } from '../src/components/realm/createRealmWildflowerMaterial';
import { REALM_GRASS_RENDER_PLANS } from '../src/components/realm/realmQuality';
import {
  REALM_WILDFLOWER_MAX_WIND_SWAY,
  REALM_WILDFLOWER_MAX_WORLD_DEFORMATION_RADIUS
} from '../src/components/realm/createRealmWildflowerMaterial';
import type { RealmGrassPoint } from '../src/game/map/realmGrass';

function point(index: number): RealmGrassPoint {
  return Object.freeze({
    coord: Object.freeze({ q: 0, r: 0 }), candidateIndex: index,
    terrainKind: 'meadow', apron: false,
    world: Object.freeze({ x: index * 0.01, z: index * -0.01 }), groundY: 0,
    surfaceNormal: Object.freeze({ x: 0, y: 1, z: 0 }), yaw: 0,
    height: 0.15, width: 0.4,
    tint: Object.freeze({ r: 0.5, g: 0.6, b: 0.3 }),
    windPhase: index * 0.01, stiffness: 1, windScale: 1, windShelter: 0,
    snowCoverage: 0, sandCoverage: 0, variant: 0, rank: index >>> 0
  });
}

describe('realm wildflower accent layer', () => {
  it('is one deterministic bounded near-detail draw with no raycast path', () => {
    const layer = createRealmWildflowerLayer({
      plan: REALM_GRASS_RENDER_PLANS.high,
      reducedMotion: false
    });
    layer.beginRepack(false);
    for (let index = 0; index < 12_000; index += 1) {
      layer.addCandidate({ point: point(index), nearCoverage: 1, distance: index % 8 });
    }
    const first = layer.commitRepack();
    expect(first.instanceCount).toBeGreaterThan(0);
    expect(first.instanceCount).toBeLessThanOrEqual(REALM_WILDFLOWER_BUDGETS.high);
    expect(first.triangleCount).toBe(first.instanceCount * 4);
    expect(first.drawCalls).toBe(1);
    expect(first.alphaHashActive).toBe(true);
    expect(first.alphaToCoverageActive).toBe(false);
    expect(layer.mesh.frustumCulled).toBe(true);
    expect(layer.mesh.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
    expect((layer.mesh.geometry.getAttribute('flowerPhase') as THREE.BufferAttribute).usage)
      .toBe(THREE.DynamicDrawUsage);
    expect((layer.mesh.geometry.getAttribute('flowerCoverage') as THREE.BufferAttribute).usage)
      .toBe(THREE.DynamicDrawUsage);
    expect(REALM_WILDFLOWER_MAX_WORLD_DEFORMATION_RADIUS).toBeGreaterThanOrEqual(0.05);
    expect(REALM_WILDFLOWER_MAX_WORLD_DEFORMATION_RADIUS)
      .toBeGreaterThan(REALM_WILDFLOWER_MAX_WIND_SWAY);
    expect(layer.mesh.geometry.userData.realmWildflowerTopology)
      .toBe('opaque-alpha-cutout-cross-billboard');
    const intersections: THREE.Intersection[] = [];
    layer.mesh.raycast(new THREE.Raycaster(), intersections);
    expect(intersections).toEqual([]);
    const firstMatrices = Array.from(layer.mesh.instanceMatrix.array.slice(
      0,
      first.instanceCount * 16
    ));

    layer.beginRepack(false);
    for (let index = 0; index < 12_000; index += 1) {
      layer.addCandidate({ point: point(index), nearCoverage: 1, distance: index % 8 });
    }
    expect(layer.commitRepack().instanceCount).toBe(first.instanceCount);
    expect(Array.from(layer.mesh.instanceMatrix.array.slice(0, first.instanceCount * 16)))
      .toEqual(firstMatrices);
    layer.dispose();
  });

  it('uses alpha-to-coverage instead of alpha hashing on an MSAA renderer', () => {
    const layer = createRealmWildflowerLayer({
      plan: REALM_GRASS_RENDER_PLANS.balanced,
      reducedMotion: false,
      alphaToCoverage: true
    });
    const material = layer.mesh.material as THREE.MeshStandardMaterial & {
      alphaHash?: boolean;
      alphaToCoverage?: boolean;
    };

    expect([material.alphaHash, material.alphaToCoverage]).toEqual([false, true]);
    expect(material.userData.realmWildflowerAlphaHash).toBe(false);
    expect(material.userData.realmWildflowerAlphaToCoverage).toBe(true);
    layer.beginRepack(false);
    for (let index = 0; index < 400; index += 1) {
      layer.addCandidate({ point: point(index), nearCoverage: 0.5, distance: 0 });
    }
    expect(layer.commitRepack()).toMatchObject({
      alphaHashActive: false,
      alphaToCoverageActive: true
    });

    layer.dispose();
  });

  it('hides fail-closed after a renderer-level shader link failure', () => {
    const layer = createRealmWildflowerMaterial(1);
    const priorVersion = layer.material.version;

    layer.activateShaderFallback('REALM_WILDFLOWER_SHADER_COMPILE_OR_LINK_FAILED');

    expect(layer.material.visible).toBe(false);
    expect(layer.material.version).toBeGreaterThan(priorVersion);
    expect(layer.getShaderTelemetry()).toEqual({
      fallbackActive: true,
      fallbackCount: 1,
      fallbackReason: 'REALM_WILDFLOWER_SHADER_COMPILE_OR_LINK_FAILED'
    });
    expect(layer.setTime(1)).toBe(false);
    layer.dispose();
  });

  it('fails closed without drawing opaque cards when the Three shader hook drifts', () => {
    const layer = createRealmWildflowerLayer({
      plan: REALM_GRASS_RENDER_PLANS.high,
      reducedMotion: false
    });
    layer.beginRepack(false);
    for (let index = 0; index < 400; index += 1) {
      layer.addCandidate({ point: point(index), nearCoverage: 1, distance: 0 });
    }
    const before = layer.commitRepack();
    expect(before.instanceCount).toBeGreaterThan(0);
    const material = layer.mesh.material as THREE.MeshStandardMaterial;
    const shader = {
      vertexShader: 'void main() {}',
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {}
    };
    const compile = material.onBeforeCompile as unknown as (
      shaderInput: typeof shader
    ) => void;

    expect(() => compile(shader)).not.toThrow();
    expect(shader.fragmentShader).toBe('void main() { discard; }');
    expect(layer.getTelemetry()).toMatchObject({
      instanceCount: 0,
      triangleCount: 0,
      drawCalls: 0,
      animated: false,
      shaderFallbackActive: true,
      shaderFallbackCount: 1,
      shaderFallbackReason: 'REALM_WILDFLOWER_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED'
    });
    expect(layer.mesh.visible).toBe(false);
    expect(material.visible).toBe(false);
    expect(layer.updateWind(1)).toBe(false);
    layer.dispose();
  });

  it('disables reduced quality entirely and freezes reduced motion', () => {
    const reduced = createRealmWildflowerLayer({
      plan: REALM_GRASS_RENDER_PLANS.reduced,
      reducedMotion: false
    });
    reduced.beginRepack(false);
    reduced.addCandidate({ point: point(1), nearCoverage: 1, distance: 0 });
    expect(reduced.commitRepack()).toMatchObject({
      budget: 0, instanceCount: 0, drawCalls: 0, overviewHidden: true
    });
    reduced.dispose();

    const frozen = createRealmWildflowerLayer({
      plan: REALM_GRASS_RENDER_PLANS.balanced,
      reducedMotion: true
    });
    frozen.beginRepack(false);
    for (let index = 0; index < 400; index += 1) {
      frozen.addCandidate({ point: point(index), nearCoverage: 0.7, distance: 0 });
    }
    expect(frozen.commitRepack().animated).toBe(false);
    expect(frozen.updateWind(1)).toBe(false);
    const uniforms = (frozen.mesh.material as THREE.Material).userData.realmWildflowerUniforms;
    expect(uniforms.uFlowerTime.value).toBe(0);
    expect(uniforms.uFlowerWindStrength.value).toBe(0);
    frozen.dispose();
  });

  it('hides optional flower cards fail-closed when the shader contract drifts', () => {
    const layer = createRealmWildflowerMaterial(1);
    const shader = {
      vertexShader: 'void main() {}',
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {}
    };

    layer.material.onBeforeCompile(shader as never, {} as never);
    expect(layer.getShaderTelemetry()).toEqual({
      fallbackActive: true,
      fallbackCount: 1,
      fallbackReason: 'REALM_WILDFLOWER_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED'
    });
    expect(layer.material.visible).toBe(false);
    expect(layer.setTime(1)).toBe(false);
    layer.setVisible(true);
    expect(layer.material.visible).toBe(false);
    expect(layer.material.customProgramCacheKey()).toContain('static-fallback');
    layer.dispose();
  });
});
