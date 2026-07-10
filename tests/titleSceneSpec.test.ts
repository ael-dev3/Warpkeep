import { describe, expect, it } from 'vitest';
import {
  calculateGalaxyGrowth,
  createSpiralGalaxyLayout,
  titleSceneSpec
} from '../src/components/title/titleSceneSpec';

describe('Warpkeep brutalist galaxy title specification', () => {
  it('keeps the title monumental, deeply extruded, premium, and non-metallic', () => {
    expect(titleSceneSpec.title.text).toBe('WARPKEEP');
    expect(titleSceneSpec.title.roughness).toBeGreaterThanOrEqual(0.88);
    expect(titleSceneSpec.title.roughness).toBeLessThanOrEqual(0.96);
    expect(titleSceneSpec.title.sideRoughness).toBeGreaterThan(titleSceneSpec.title.roughness);
    expect(titleSceneSpec.title.sideRoughness).toBeLessThanOrEqual(1);
    expect(titleSceneSpec.title.metalness).toBe(0);
    expect(titleSceneSpec.title.bumpScale).toBeGreaterThan(0);
    expect(titleSceneSpec.title.bumpScale).toBeLessThanOrEqual(0.018);
    expect(titleSceneSpec.title.depth / titleSceneSpec.title.height).toBeGreaterThanOrEqual(0.4);
    expect(titleSceneSpec.title.bevelSize).toBeLessThanOrEqual(0.02);
    expect(titleSceneSpec.title.desktopViewportWidth).toBeGreaterThanOrEqual(0.92);
    expect(titleSceneSpec.title.desktopViewportWidth).toBeLessThanOrEqual(0.93);
    expect(titleSceneSpec.title.mobileViewportWidth).toBeGreaterThanOrEqual(0.9);
    expect(titleSceneSpec.title.mobileViewportWidth).toBeLessThanOrEqual(0.92);
    expect(Number.parseInt(titleSceneSpec.palette.concrete.slice(1), 16)).toBeGreaterThan(
      Number.parseInt(titleSceneSpec.palette.concreteShadow.slice(1), 16)
    );
  });

  it('keeps the gravitational core restrained and integrated inside a larger complete galaxy', () => {
    expect(titleSceneSpec.galaxy.armCount).toBeGreaterThanOrEqual(5);
    expect(titleSceneSpec.core.shadowRadius).toBeLessThan(titleSceneSpec.core.accretionRadius);
    expect(titleSceneSpec.core.accretionRadius).toBeLessThan(titleSceneSpec.core.lensRadius);
    expect(titleSceneSpec.galaxy.desktopViewportWidth).toBeGreaterThanOrEqual(0.88);
    expect(titleSceneSpec.galaxy.desktopViewportWidth).toBeLessThanOrEqual(0.96);
    expect(titleSceneSpec.galaxy.desktopViewportHeight).toBeGreaterThanOrEqual(0.7);
    expect(titleSceneSpec.galaxy.desktopViewportHeight).toBeLessThanOrEqual(0.8);
    expect(titleSceneSpec.galaxy.verticalScale).toBeGreaterThanOrEqual(0.45);
    expect(titleSceneSpec.galaxy.verticalScale).toBeLessThanOrEqual(0.54);
    expect(titleSceneSpec.galaxy.portraitViewportWidth).toBeGreaterThanOrEqual(1.04);
    expect(titleSceneSpec.galaxy.portraitViewportWidth).toBeLessThanOrEqual(1.14);
    expect(titleSceneSpec.galaxy.shortLandscapeBaseY).toBeGreaterThanOrEqual(-0.6);
    expect(titleSceneSpec.galaxy.shortLandscapeBaseY).toBeLessThanOrEqual(0.2);
    expect(titleSceneSpec.galaxy.purpleMix).toBeGreaterThanOrEqual(0.38);
    expect(titleSceneSpec.galaxy.purpleMix).toBeLessThanOrEqual(0.64);
    expect(titleSceneSpec.galaxy.desktopParticleCount).toBeLessThanOrEqual(8_000);
    expect(titleSceneSpec.galaxy.mobileParticleCount).toBeLessThanOrEqual(5_000);
  });

  it('rotates visibly but slowly and grows only a little over several minutes', () => {
    expect(titleSceneSpec.galaxy.rotationPeriodSeconds).toBeGreaterThanOrEqual(180);
    expect(titleSceneSpec.galaxy.rotationPeriodSeconds).toBeLessThanOrEqual(420);
    expect(calculateGalaxyGrowth(-1)).toBe(1);
    expect(calculateGalaxyGrowth(60)).toBeGreaterThan(1);
    expect(calculateGalaxyGrowth(60)).toBeLessThan(1.03);
    expect(calculateGalaxyGrowth(300)).toBeGreaterThan(calculateGalaxyGrowth(60));
    expect(calculateGalaxyGrowth(10_000)).toBeLessThanOrEqual(1 + titleSceneSpec.galaxy.maxGrowth);
    expect(calculateGalaxyGrowth(10_000)).toBeCloseTo(1 + titleSceneSpec.galaxy.maxGrowth, 8);
  });

  it('keeps galaxy and title shine slow, restrained, and cinematic', () => {
    expect(titleSceneSpec.galaxy.shinePeriodSeconds).toBeGreaterThanOrEqual(10);
    expect(titleSceneSpec.galaxy.shinePeriodSeconds).toBeLessThanOrEqual(22);
    expect(titleSceneSpec.galaxy.maxPointSize).toBeGreaterThanOrEqual(8);
    expect(titleSceneSpec.galaxy.maxPointSize).toBeLessThanOrEqual(16);
    expect(titleSceneSpec.title.shinePeriodSeconds).toBeGreaterThanOrEqual(28);
    expect(titleSceneSpec.title.shinePeriodSeconds).toBeLessThanOrEqual(40);
  });

  it('keeps the gateway responsive, practical to target, and cinematically paced', () => {
    const gateway = titleSceneSpec.gateway;

    expect(gateway.interactionRadiusRatio).toBeGreaterThanOrEqual(0.25);
    expect(gateway.interactionRadiusRatio).toBeLessThanOrEqual(0.35);
    expect(gateway.hitSizeMinPx).toBeGreaterThanOrEqual(56);
    expect(gateway.hitSizeMaxPx).toBeGreaterThanOrEqual(gateway.hitSizeMinPx);
    expect(gateway.hitSizeMaxPx).toBeLessThanOrEqual(88);
    expect(gateway.proximityRiseResponse).toBeGreaterThan(gateway.proximitySettleResponse);
    expect(gateway.idlePulsePeriodSeconds).toBeGreaterThan(gateway.activePulsePeriodSeconds);
    expect(gateway.surgeDurationSeconds).toBeGreaterThanOrEqual(0.8);
    expect(gateway.surgeDurationSeconds).toBeLessThanOrEqual(1.5);
    expect(gateway.noticeDurationMs).toBeGreaterThanOrEqual(4_000);
    expect(gateway.noticeDurationMs).toBeLessThanOrEqual(6_000);
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
      const radius = Math.hypot(x, y);
      expect(radius).toBeLessThanOrEqual(titleSceneSpec.galaxy.radius * 1.16);
    }
  });
});
