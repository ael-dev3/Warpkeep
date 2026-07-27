import { describe, expect, it } from 'vitest';

import {
  createRealmProceduralForestFallbackGeometry,
  createRealmProceduralForestFallbackMaterial,
  REALM_PROCEDURAL_FOREST_FALLBACK_TYPE,
  realmForestFallbackInstanceColor,
  realmForestModelInstanceTint
} from '../src/components/realm/createRealmProceduralForestFallback';
import { REALM_DECORATIVE_FOREST_RENDER_BUDGETS } from '../src/components/realm/createRealmDecorativeForestLayer';
import { HEGEMONY_TREE_TARGET_VISUAL_HEIGHT } from '../src/components/realm/hegemonyTreeRuntimeAssets';

describe('local procedural forest fallback', () => {
  it('builds a grounded trunk and asymmetric multi-canopy silhouette', () => {
    const fallback = createRealmProceduralForestFallbackGeometry(
      HEGEMONY_TREE_TARGET_VISUAL_HEIGHT
    );
    const position = fallback.geometry.getAttribute('position');
    const color = fallback.geometry.getAttribute('color');
    const normal = fallback.geometry.getAttribute('normal');
    const index = fallback.geometry.getIndex();
    const bounds = fallback.geometry.boundingBox!;

    expect(fallback.fallbackType).toBe(REALM_PROCEDURAL_FOREST_FALLBACK_TYPE);
    expect(fallback.includesRootContact).toBe(true);
    expect(fallback.triangleCount).toBeGreaterThan(40);
    expect(fallback.triangleCount).toBeLessThan(100);
    expect(position.count).toBeGreaterThan(40);
    expect(color.count).toBe(position.count);
    expect(normal.count).toBe(position.count);
    expect(index?.array).toBeInstanceOf(Uint16Array);
    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(bounds.max.y).toBeCloseTo(HEGEMONY_TREE_TARGET_VISUAL_HEIGHT, 5);
    expect(Math.abs(bounds.min.x)).not.toBeCloseTo(Math.abs(bounds.max.x), 4);

    fallback.geometry.dispose();
  });

  it('keeps the richer fallback beneath every existing quality triangle ceiling', () => {
    const fallback = createRealmProceduralForestFallbackGeometry(
      HEGEMONY_TREE_TARGET_VISUAL_HEIGHT
    );
    Object.values(REALM_DECORATIVE_FOREST_RENDER_BUDGETS).forEach((budget) => {
      expect(fallback.triangleCount * budget.instances)
        .toBeLessThanOrEqual(budget.triangles);
    });
    fallback.geometry.dispose();
  });

  it('uses distinct habitat palettes and a local disposable material', () => {
    expect(new Set([
      realmForestFallbackInstanceColor('grove'),
      realmForestFallbackInstanceColor('forest'),
      realmForestFallbackInstanceColor('fringe')
    ]).size).toBe(3);
    expect(new Set([
      realmForestModelInstanceTint('grove'),
      realmForestModelInstanceTint('forest'),
      realmForestModelInstanceTint('fringe')
    ]).size).toBe(3);
    const material = createRealmProceduralForestFallbackMaterial();
    expect(material.vertexColors).toBe(true);
    expect(material.roughness).toBeGreaterThanOrEqual(0.9);
    expect(material.metalness).toBe(0);
    material.dispose();
  });
});
