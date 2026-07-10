import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createGatewayVfxAssembly } from '../src/components/title/gatewayVfx';
import {
  calculateGatewayActivationEnvelope,
  calculateGatewayVfxResponse,
  gatewayVfxQualitySpecs,
  type GatewayVfxQuality
} from '../src/components/title/gatewayVfxSpec';

const qualities: readonly GatewayVfxQuality[] = ['high', 'compact', 'reduced'];

function createAssembly(quality: GatewayVfxQuality) {
  return createGatewayVfxAssembly({
    quality,
    pixelRatio: 1.5,
    galaxyRadius: 7.8,
    shadowRadius: 0.055,
    accretionRadius: 0.17,
    lensRadius: 0.29
  });
}

describe('Warpkeep gateway VFX assembly', () => {
  it.each(qualities)('batches the %s profile inside its draw and particle budget', (quality) => {
    const assembly = createAssembly(quality);
    const spec = gatewayVfxQualitySpecs[quality];
    const drawables = assembly.group.children.filter(
      (child) => child instanceof THREE.Mesh || child instanceof THREE.Points
    );
    const pointSystems = assembly.group.children.filter((child) => child instanceof THREE.Points);

    expect(assembly.stats.quality).toBe(quality);
    expect(assembly.stats.particleCount).toBe(spec.particleCount);
    expect(assembly.stats.ribbonCount).toBe(spec.ribbonCount);
    expect(assembly.stats.filamentCount).toBe(spec.filamentCount);
    expect(assembly.stats.incrementalDrawCalls).toBeLessThanOrEqual(spec.maxNewDrawCalls);
    expect(assembly.stats.drawCalls).toBe(drawables.length);
    drawables
      .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
      .forEach((mesh) => {
        expect((mesh.material as THREE.Material).side).toBe(THREE.FrontSide);
      });
    expect(pointSystems).toHaveLength(1);
    expect(assembly.stats.renderTargetCount).toBe(0);
    assembly.dispose();
  });

  it('keeps every shared uniform finite under extreme frame inputs', () => {
    const assembly = createAssembly('high');
    const response = calculateGatewayVfxResponse(Number.POSITIVE_INFINITY, 'high');
    const activation = calculateGatewayActivationEnvelope(0.52);
    assembly.update({
      time: Number.NaN,
      delta: Number.POSITIVE_INFINITY,
      proximity: Number.NEGATIVE_INFINITY,
      pulsePhase: Number.NaN,
      flowPhase: Number.POSITIVE_INFINITY,
      response,
      activation,
      pointerLocal: new THREE.Vector2(0.12, -0.08),
      pointerDirection: new THREE.Vector2(0.6, -0.8),
      pointerValid: true,
      reducedMotion: false
    });
    assembly.setPixelRatio(Number.NaN);

    assembly.materials.forEach((material) => {
      Object.values(material.uniforms).forEach(({ value }) => {
        if (typeof value === 'number') {
          expect(Number.isFinite(value)).toBe(true);
        } else if (value instanceof THREE.Vector2) {
          expect(Number.isFinite(value.x)).toBe(true);
          expect(Number.isFinite(value.y)).toBe(true);
        }
      });
    });
    assembly.dispose();
  });

  it('removes itself and disposes every unique GPU resource exactly once', () => {
    const assembly = createAssembly('high');
    const parent = new THREE.Group();
    parent.add(assembly.group);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    assembly.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => materials.add(material));
      }
    });
    const geometrySpies = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialSpies = [...materials].map((material) => vi.spyOn(material, 'dispose'));

    assembly.dispose();
    assembly.dispose();

    expect(assembly.group.parent).toBeNull();
    geometrySpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    materialSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });
});
