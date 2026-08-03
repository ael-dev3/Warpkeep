import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  applyRealmForestDrylandTint,
  applyRealmForestWinterTint,
  createRealmProceduralForestFallbackGeometry,
  createRealmProceduralForestFallbackMaterial,
  REALM_FOREST_MAX_AUTHORED_DRY_MIX,
  REALM_FOREST_MAX_AUTHORED_SNOW_MIX,
  REALM_FOREST_MAX_DRYLAND_TINT_MIX,
  REALM_FOREST_MAX_WINTER_TINT_MIX,
  REALM_PROCEDURAL_FOREST_FALLBACK_TYPE,
  realmForestAuthoredDryMix,
  realmForestAuthoredSnowMix,
  realmForestDrylandTintMix,
  realmForestFallbackInstanceColor,
  realmForestModelInstanceTint,
  realmForestWinterTintMix,
  sampleRealmForestSandCoverage
} from '../src/components/realm/createRealmProceduralForestFallback';
import { REALM_DECORATIVE_FOREST_RENDER_BUDGETS } from '../src/components/realm/createRealmDecorativeForestLayer';
import { HEGEMONY_TREE_TARGET_VISUAL_HEIGHT } from '../src/components/realm/hegemonyTreeRuntimeAssets';
import type { RealmSouthernDesertField } from '../src/game/map/realmSouthernDesert';

describe('local procedural forest fallback', () => {
  it('builds a grounded trunk and asymmetric multi-canopy silhouette', () => {
    const fallback = createRealmProceduralForestFallbackGeometry(
      HEGEMONY_TREE_TARGET_VISUAL_HEIGHT
    );
    const position = fallback.geometry.getAttribute('position');
    const color = fallback.geometry.getAttribute('color');
    const normal = fallback.geometry.getAttribute('normal');
    const windWeight = fallback.geometry.getAttribute('realmForestWindWeight');
    const windPhase = fallback.geometry.getAttribute('realmForestWindPhase');
    const index = fallback.geometry.getIndex();
    const bounds = fallback.geometry.boundingBox!;

    expect(fallback.fallbackType).toBe(REALM_PROCEDURAL_FOREST_FALLBACK_TYPE);
    expect(fallback.includesRootContact).toBe(true);
    expect(fallback.triangleCount).toBeGreaterThan(40);
    expect(fallback.triangleCount).toBeLessThan(100);
    expect(position.count).toBeGreaterThan(40);
    expect(color.count).toBe(position.count);
    expect(normal.count).toBe(position.count);
    expect(windWeight.count).toBe(position.count);
    expect(windPhase.count).toBe(position.count);
    expect(windWeight.array).toBeInstanceOf(Uint8Array);
    expect(windPhase.array).toBeInstanceOf(Uint8Array);
    expect(windWeight.normalized).toBe(true);
    expect(windPhase.normalized).toBe(true);
    expect(Array.from(windWeight.array).some((value) => value === 0)).toBe(true);
    expect(Array.from(windWeight.array).some((value) => value > 0)).toBe(true);
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
    const modelTints = [
      realmForestModelInstanceTint('grove'),
      realmForestModelInstanceTint('forest'),
      realmForestModelInstanceTint('fringe')
    ];
    expect(new Set(modelTints).size).toBe(3);
    modelTints.forEach((tint) => {
      const color = new THREE.Color(tint);
      expect(color.g).toBeGreaterThan(color.r);
      expect(color.g).toBeGreaterThan(color.b);
    });
    const material = createRealmProceduralForestFallbackMaterial();
    expect(material.vertexColors).toBe(true);
    expect(material.roughness).toBeGreaterThanOrEqual(0.9);
    expect(material.metalness).toBe(0);
    material.dispose();
  });

  it('keeps authored dusting continuous, capped, and materially top-facing', () => {
    const transitionLeft = realmForestAuthoredSnowMix(0.5 - 0.000_001, 1);
    const transitionRight = realmForestAuthoredSnowMix(0.5 + 0.000_001, 1);
    const upward = realmForestAuthoredSnowMix(1, 1);
    const sideways = realmForestAuthoredSnowMix(1, 0.2);
    const downward = realmForestAuthoredSnowMix(1, -1);

    expect(Math.abs(transitionRight - transitionLeft)).toBeLessThan(0.000_01);
    expect(upward).toBeGreaterThan(sideways);
    expect(sideways).toBeGreaterThan(downward);
    expect(downward).toBe(0);
    expect(upward).toBeLessThanOrEqual(REALM_FOREST_MAX_AUTHORED_SNOW_MIX);
    expect(realmForestAuthoredSnowMix(Number.NaN, 1)).toBe(0);
    expect(realmForestAuthoredSnowMix(1, Number.NaN)).toBe(0);
  });

  it('uses a bounded cool fallback tint without turning trees into white cones', () => {
    const base = new THREE.Color(realmForestFallbackInstanceColor('forest'));
    const winter = applyRealmForestWinterTint(base.clone(), 1);

    expect(realmForestWinterTintMix(1))
      .toBeLessThanOrEqual(REALM_FOREST_MAX_WINTER_TINT_MIX);
    expect(winter.equals(base)).toBe(false);
    expect(Math.max(winter.r, winter.g, winter.b)).toBeLessThan(0.8);
    expect(winter.b - base.b).toBeGreaterThan(winter.r - base.r);
    expect(realmForestWinterTintMix(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('keeps dryland warmth continuous, bounded, and a strict zero-sand no-op', () => {
    const left = realmForestAuthoredDryMix(0.5 - 0.000_001);
    const right = realmForestAuthoredDryMix(0.5 + 0.000_001);
    const base = new THREE.Color(realmForestFallbackInstanceColor('forest'));
    const central = applyRealmForestDrylandTint(base.clone(), 0);
    const dry = applyRealmForestDrylandTint(base.clone(), 1);

    expect(Math.abs(right - left)).toBeLessThan(0.000_01);
    expect(realmForestAuthoredDryMix(1))
      .toBeLessThanOrEqual(REALM_FOREST_MAX_AUTHORED_DRY_MIX);
    expect(realmForestDrylandTintMix(1))
      .toBeLessThanOrEqual(REALM_FOREST_MAX_DRYLAND_TINT_MIX);
    expect([central.r, central.g, central.b]).toEqual([base.r, base.g, base.b]);
    expect(dry.equals(base)).toBe(false);
    expect(dry.r - base.r).toBeGreaterThan(dry.b - base.b);
    expect(Math.max(dry.r, dry.g, dry.b)).toBeLessThan(0.8);
    expect(realmForestAuthoredDryMix(Number.NaN)).toBe(0);
    expect(realmForestDrylandTintMix(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sampleRealmForestSandCoverage({
      sandAtWorld: () => {
        throw new Error('synthetic field failure');
      }
    } as unknown as RealmSouthernDesertField, { x: 0, z: 0 })).toBe(0);
  });
});
