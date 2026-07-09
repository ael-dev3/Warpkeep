import { describe, expect, it } from 'vitest';
import { createSpiralGalaxyLayout, titleSceneSpec } from '../src/components/title/titleSceneSpec';

describe('Warpkeep brutalist galaxy title specification', () => {
  it('keeps the title monumental, pristine, and non-metallic', () => {
    expect(titleSceneSpec.title.text).toBe('WARPKEEP');
    expect(titleSceneSpec.title.roughness).toBeGreaterThanOrEqual(0.65);
    expect(titleSceneSpec.title.metalness).toBeLessThanOrEqual(0.08);
    expect(titleSceneSpec.title.desktopViewportWidth).toBeGreaterThanOrEqual(0.9);
    expect(titleSceneSpec.title.mobileViewportWidth).toBeGreaterThanOrEqual(0.88);
    expect(titleSceneSpec.title.mobileViewportWidth).toBeLessThanOrEqual(0.92);
  });

  it('keeps the warp rift proportionally restrained inside a complete galaxy', () => {
    expect(titleSceneSpec.galaxy.armCount).toBeGreaterThanOrEqual(4);
    expect(titleSceneSpec.galaxy.radius / titleSceneSpec.rift.radius).toBeGreaterThanOrEqual(12);
    expect(titleSceneSpec.galaxy.desktopParticleCount).toBeLessThanOrEqual(5_000);
    expect(titleSceneSpec.galaxy.mobileParticleCount).toBeLessThanOrEqual(3_000);
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
