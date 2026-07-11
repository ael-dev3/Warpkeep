import { describe, expect, it } from 'vitest';

import {
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
    expect(REALM_QUALITY_SPECS.compact).toMatchObject({
      subdivisionsPerEdge: 5,
      dynamicShadows: false
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
      .toBe('compact');
    expect(selectRealmQuality({ width: 480, height: 320, devicePixelRatio: 3, maxTextureSize: 4096 }))
      .toBe('reduced');
  });

  it('caps clean high-DPI output against profile and pixel budgets', () => {
    expect(resolveRealmPixelRatio(1440, 900, 2, REALM_QUALITY_SPECS.high)).toBe(2);
    expect(resolveRealmPixelRatio(1920, 1080, 4, REALM_QUALITY_SPECS.high)).toBeCloseTo(2, 4);
    expect(resolveRealmPixelRatio(3840, 2160, 2, REALM_QUALITY_SPECS.high)).toBeCloseTo(1.006, 2);
    expect(resolveRealmPixelRatio(1280, 720, 3, REALM_QUALITY_SPECS.compact)).toBe(1.6);
  });
});
