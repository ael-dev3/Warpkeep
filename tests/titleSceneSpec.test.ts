import { describe, expect, it } from 'vitest';
import { createSpiralGalaxyLayout, titleSceneSpec } from '../src/components/title/titleSceneSpec';

describe('Warpkeep brutalist galaxy title specification', () => {
  it('keeps the title monumental, pristine, and non-metallic', () => {
    expect(titleSceneSpec.title.text).toBe('WARPKEEP');
    expect(titleSceneSpec.title.roughness).toBeGreaterThanOrEqual(0.65);
    expect(titleSceneSpec.title.metalness).toBeLessThanOrEqual(0.08);
    expect(titleSceneSpec.title.desktopViewportWidth).toBeGreaterThanOrEqual(0.88);
    expect(titleSceneSpec.title.desktopViewportWidth).toBeLessThanOrEqual(0.92);
    expect(titleSceneSpec.title.mobileViewportWidth).toBeGreaterThanOrEqual(0.88);
    expect(titleSceneSpec.title.mobileViewportWidth).toBeLessThanOrEqual(0.92);
  });

  it('keeps the warp rift proportionally restrained inside a larger complete galaxy', () => {
    expect(titleSceneSpec.galaxy.armCount).toBeGreaterThanOrEqual(4);
    expect(titleSceneSpec.galaxy.radius / titleSceneSpec.rift.radius).toBeGreaterThanOrEqual(12);
    expect(titleSceneSpec.galaxy.desktopViewportWidth).toBeGreaterThanOrEqual(0.62);
    expect(titleSceneSpec.galaxy.desktopViewportWidth).toBeLessThanOrEqual(0.72);
    expect(titleSceneSpec.galaxy.desktopViewportHeight).toBeGreaterThanOrEqual(0.6);
    expect(titleSceneSpec.galaxy.desktopViewportHeight).toBeLessThanOrEqual(0.68);
    expect(titleSceneSpec.galaxy.verticalScale).toBeGreaterThanOrEqual(0.48);
    expect(titleSceneSpec.galaxy.verticalScale).toBeLessThanOrEqual(0.58);
    expect(titleSceneSpec.galaxy.portraitViewportWidth).toBeGreaterThanOrEqual(0.88);
    expect(titleSceneSpec.galaxy.portraitViewportWidth).toBeLessThanOrEqual(0.96);
    expect(titleSceneSpec.galaxy.shortLandscapeBaseY).toBeGreaterThanOrEqual(-0.6);
    expect(titleSceneSpec.galaxy.shortLandscapeBaseY).toBeLessThanOrEqual(0.2);
    expect(titleSceneSpec.galaxy.purpleMix).toBeGreaterThanOrEqual(0.38);
    expect(titleSceneSpec.galaxy.purpleMix).toBeLessThanOrEqual(0.56);
    expect(titleSceneSpec.galaxy.desktopParticleCount).toBeLessThanOrEqual(5_000);
    expect(titleSceneSpec.galaxy.mobileParticleCount).toBeLessThanOrEqual(3_000);
  });

  it('keeps galaxy and title shine slow, restrained, and cinematic', () => {
    expect(titleSceneSpec.galaxy.shinePeriodSeconds).toBeGreaterThanOrEqual(10);
    expect(titleSceneSpec.galaxy.shinePeriodSeconds).toBeLessThanOrEqual(22);
    expect(titleSceneSpec.galaxy.maxPointSize).toBeGreaterThanOrEqual(8);
    expect(titleSceneSpec.galaxy.maxPointSize).toBeLessThanOrEqual(16);
    expect(titleSceneSpec.title.shinePeriodSeconds).toBeGreaterThanOrEqual(9);
    expect(titleSceneSpec.title.shinePeriodSeconds).toBeLessThanOrEqual(20);
    expect(titleSceneSpec.title.shineStrength).toBeGreaterThan(0.1);
    expect(titleSceneSpec.title.shineStrength).toBeLessThanOrEqual(0.6);
  });

  it('generates a deterministic full spiral layout within the configured radius', () => {
    const first = createSpiralGalaxyLayout(256, 91);
    const second = createSpiralGalaxyLayout(256, 91);

    expect(first.positions).toEqual(second.positions);
    expect(first.phases).toEqual(second.phases);
    expect(first.sizes).toEqual(second.sizes);
    expect(first.positions).toHaveLength(256 * 3);
    expect(first.phases).toHaveLength(256);
    expect(first.sizes).toHaveLength(256);

    for (let index = 0; index < 256; index += 1) {
      const x = first.positions[index * 3];
      const y = first.positions[index * 3 + 1];
      const radius = Math.hypot(x, y / titleSceneSpec.galaxy.verticalScale);
      expect(radius).toBeLessThanOrEqual(titleSceneSpec.galaxy.radius * 1.16);
    }
  });
});
