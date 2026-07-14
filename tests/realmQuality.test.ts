import { describe, expect, it } from 'vitest';

import {
  MIN_REALM_PIXEL_RATIO,
  REALM_LIGHTING_SPECS,
  REALM_QUALITY_SPECS,
  resolveRealmPixelRatio,
  selectRealmQuality
} from '../src/components/realm/realmQuality';

describe('realm quality profiles', () => {
  it('keeps every profile inside the declared terrain and rendering budgets', () => {
    expect(REALM_QUALITY_SPECS.high).toMatchObject({
      subdivisionsPerEdge: 8,
      playableRadius: 4,
      renderRadius: 5,
      dynamicShadows: true,
      shadowMapSize: 2048
    });
    expect(REALM_QUALITY_SPECS.balanced).toMatchObject({
      subdivisionsPerEdge: 6,
      dynamicShadows: true,
      shadowMapSize: 1024
    });
    expect(REALM_QUALITY_SPECS.reduced).toMatchObject({
      subdivisionsPerEdge: 3,
      dynamicShadows: false
    });
    Object.values(REALM_QUALITY_SPECS).forEach((spec) => {
      expect(spec.playableRadius).toBeLessThan(spec.renderRadius);
      expect(spec.pixelRatioCap).toBeGreaterThanOrEqual(1);
      expect(spec.keepAssetPath.endsWith('.glb')).toBe(true);
    });
  });

  it('selects capability-based profiles without user-agent sniffing', () => {
    expect(selectRealmQuality({ width: 1920, height: 1080, devicePixelRatio: 2, maxTextureSize: 16384 }))
      .toBe('high');
    expect(selectRealmQuality({ width: 844, height: 390, devicePixelRatio: 3, maxTextureSize: 8192 }))
      .toBe('balanced');
    expect(selectRealmQuality({ width: 480, height: 320, devicePixelRatio: 3, maxTextureSize: 2_048 }))
      .toBe('reduced');
    expect(selectRealmQuality({ width: 320, height: 568, devicePixelRatio: 3, maxTextureSize: 8_192 }))
      .toBe('balanced');
  });

  it('defines restrained quality-aware exposure and warm sunlight', () => {
    expect(REALM_LIGHTING_SPECS).toEqual({
      high: { toneMappingExposure: 1.02, sunIntensity: 2 },
      balanced: { toneMappingExposure: 1, sunIntensity: 1.85 },
      reduced: { toneMappingExposure: 0.98, sunIntensity: 1.7 }
    });
  });

  it('caps clean high-DPI output against profile and pixel budgets', () => {
    expect(resolveRealmPixelRatio(1440, 900, 2, REALM_QUALITY_SPECS.high)).toBe(2);
    expect(resolveRealmPixelRatio(1920, 1080, 4, REALM_QUALITY_SPECS.high)).toBeCloseTo(2, 4);
    expect(resolveRealmPixelRatio(3840, 2160, 2, REALM_QUALITY_SPECS.high)).toBeCloseTo(1.006, 2);
    expect(resolveRealmPixelRatio(1280, 720, 3, REALM_QUALITY_SPECS.balanced)).toBeCloseTo(1.75, 4);
  });

  it('scales oversized canvases below one to honour their drawing-buffer budget', () => {
    const width = 7_680;
    const height = 4_320;
    const ratio = resolveRealmPixelRatio(width, height, 2, REALM_QUALITY_SPECS.high);

    expect(ratio).toBeLessThan(1);
    expect(width * height * ratio * ratio)
      .toBeLessThanOrEqual(REALM_QUALITY_SPECS.high.maxDrawingBufferPixels);
  });

  it('keeps an intentional resolution floor for pathological canvas sizes', () => {
    expect(resolveRealmPixelRatio(32_000, 18_000, 2, REALM_QUALITY_SPECS.reduced))
      .toBe(MIN_REALM_PIXEL_RATIO);
    expect(resolveRealmPixelRatio(32_000, 18_000, 0.4, REALM_QUALITY_SPECS.reduced))
      .toBe(0.4);
  });
});
