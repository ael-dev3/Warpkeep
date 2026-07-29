import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  createRealmTerrainMaterial,
  injectRealmTerrainFragmentShader,
  injectRealmTerrainVertexShader,
  realmTerrainFineReliefMode,
  realmTerrainShaderCacheKey,
  REALM_TERRAIN_SHADER_CACHE_KEY,
  REALM_TERRAIN_THREE_SHADER_CONTRACT
} from '../src/components/realm/createRealmTerrainMaterial';

describe('Crafted Lowlands terrain material', () => {
  it('injects the pinned slope, hollow, vegetation, and wetness contract', () => {
    const vertex = injectRealmTerrainVertexShader(THREE.ShaderLib.standard.vertexShader);
    const fragment = injectRealmTerrainFragmentShader(
      THREE.ShaderLib.standard.fragmentShader
    );

    expect(vertex).toContain('attribute vec4 terrainSurfaceCue;');
    expect(vertex).toContain('attribute float terrainSnowCoverage;');
    expect(vertex).toContain('vTerrainSurfaceCue = terrainSurfaceCue;');
    expect(vertex).toContain('vTerrainSnowCoverage = terrainSnowCoverage;');
    expect(vertex).toContain('vTerrainWorldXZ');
    expect(fragment).toContain('float terrainSlope');
    expect(fragment).toContain('float terrainHollow');
    expect(fragment).toContain('float terrainVegetation');
    expect(fragment).toContain('float terrainWetness');
    expect(fragment).toContain('float terrainSnow');
    expect(fragment).toContain('roughnessFactor = clamp(');
    expect(fragment).toContain('fwidth(warpkeepSnowPhase)');
    expect(() => injectRealmTerrainVertexShader('void main() {}'))
      .toThrow('REALM_TERRAIN_SHADER_VERTEX_CONTRACT_CHANGED');
    expect(() => injectRealmTerrainFragmentShader('void main() {}'))
      .toThrow('REALM_TERRAIN_SHADER_FRAGMENT_CONTRACT_CHANGED');
  });

  it('selects bounded fine relief by quality without changing material family', () => {
    const high = injectRealmTerrainFragmentShader(
      THREE.ShaderLib.standard.fragmentShader,
      realmTerrainFineReliefMode('high')
    );
    const balanced = injectRealmTerrainFragmentShader(
      THREE.ShaderLib.standard.fragmentShader,
      realmTerrainFineReliefMode('balanced')
    );
    const reduced = injectRealmTerrainFragmentShader(
      THREE.ShaderLib.standard.fragmentShader,
      realmTerrainFineReliefMode('reduced')
    );

    expect(high).toContain('warpkeepSnowCrossPhase');
    expect(high.match(/fwidth\(/g)).toHaveLength(2);
    expect(balanced).not.toContain('warpkeepSnowCrossPhase');
    expect(balanced.match(/fwidth\(/g)).toHaveLength(1);
    expect(reduced).not.toContain('warpkeepSnowGradient');
    expect(reduced).not.toContain('fwidth(');
    expect(new Set([
      realmTerrainShaderCacheKey('high'),
      realmTerrainShaderCacheKey('balanced'),
      realmTerrainShaderCacheKey('reduced')
    ])).toHaveProperty('size', 3);
  });

  it('retains an ordinary standard material when a shader marker drifts', () => {
    const layer = createRealmTerrainMaterial();
    const shader = {
      vertexShader: 'void main() {}',
      fragmentShader: 'void main() {}',
      uniforms: {}
    } as Parameters<typeof layer.material.onBeforeCompile>[0];

    layer.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.vertexShader).toBe('void main() {}');
    expect(shader.fragmentShader).toBe('void main() {}');
    expect(layer.getTelemetry()).toMatchObject({
      shaderContract: REALM_TERRAIN_THREE_SHADER_CONTRACT,
      shaderEnhanced: false,
      shaderFallbackActive: true,
      compileAttemptCount: 1,
      fineReliefMode: 'one-band'
    });
    expect(layer.getTelemetryRevision()).toBe(1);
    expect(layer.material.customProgramCacheKey()).toBe(
      REALM_TERRAIN_SHADER_CACHE_KEY
    );
    layer.dispose();
  });

  it('records a successful one-time enhancement without changing material class', () => {
    const layer = createRealmTerrainMaterial();
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {}
    } as Parameters<typeof layer.material.onBeforeCompile>[0];

    layer.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(layer.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(layer.material.roughness).toBe(0.94);
    expect(layer.material.metalness).toBe(0);
    expect(layer.getTelemetry()).toMatchObject({
      shaderEnhanced: true,
      shaderFallbackActive: false,
      compileAttemptCount: 1,
      fineReliefMode: 'one-band'
    });
    expect(layer.getTelemetryRevision()).toBe(1);
    layer.dispose();
  });
});
