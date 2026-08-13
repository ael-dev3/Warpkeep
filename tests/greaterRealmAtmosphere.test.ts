import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_ATMOSPHERE_VERSION,
  compositeGreaterRealmAtmosphere,
  integrateGreaterRealmHeightFog,
} from '../scripts/atlas/greater-realm-atmosphere';

describe('Greater Realm height atmosphere', () => {
  it('fills valleys more heavily while leaving high peaks clearer', () => {
    const common = {
      originHeight: 24_000,
      rayLength: 34_000,
      density: 0.000_085,
      heightFalloff: 0.000_11,
    } as const;
    const valley = integrateGreaterRealmHeightFog({
      ...common,
      rayHeightDelta: -23_000,
    });
    const peak = integrateGreaterRealmHeightFog({
      ...common,
      rayHeightDelta: -10_000,
    });

    expect(GREATER_REALM_ATMOSPHERE_VERSION).toBe(
      'greater-realm-height-atmosphere-v1',
    );
    expect(valley).toBeGreaterThan(peak);
    expect(peak).toBeGreaterThanOrEqual(0);
    expect(valley).toBeLessThanOrEqual(1);
  });

  it('stays finite for a horizontal camera ray and rejects invalid authority', () => {
    const horizontal = integrateGreaterRealmHeightFog({
      originHeight: 2_000,
      rayHeightDelta: 0,
      rayLength: 20_000,
      density: 0.000_05,
      heightFalloff: 0.000_1,
    });

    expect(Number.isFinite(horizontal)).toBe(true);
    expect(horizontal).toBeGreaterThan(0);
    expect(() =>
      integrateGreaterRealmHeightFog({
        originHeight: 0,
        rayHeightDelta: 0,
        rayLength: -1,
        density: 1,
        heightFalloff: 1,
      }),
    ).toThrow('GREATER_REALM_HEIGHT_FOG_INPUT_INVALID');
    expect(() =>
      integrateGreaterRealmHeightFog({
        originHeight: 10,
        rayHeightDelta: -11,
        rayLength: 10,
        density: 0.1,
        heightFalloff: 0.1,
      }),
    ).toThrow('GREATER_REALM_HEIGHT_FOG_INPUT_INVALID');
  });

  it('accumulates more atmosphere along a longer ray at the same height span', () => {
    const common = {
      originHeight: 18_000,
      rayHeightDelta: -10_000,
      density: 0.000_04,
      heightFalloff: 0.000_09,
    } as const;
    const near = integrateGreaterRealmHeightFog({
      ...common,
      rayLength: 12_000,
    });
    const far = integrateGreaterRealmHeightFog({
      ...common,
      rayLength: 32_000,
    });

    expect(far).toBeGreaterThan(near);
  });

  it('keeps extinction and in-scattering as independently testable terms', () => {
    const scene = [120, 100, 80] as const;
    const haze = [180, 200, 225] as const;
    const extincted = compositeGreaterRealmAtmosphere({
      scene,
      haze,
      extinction: 0.5,
      inScattering: 0,
    });
    const scattered = compositeGreaterRealmAtmosphere({
      scene,
      haze,
      extinction: 0,
      inScattering: 0.5,
    });
    const combined = compositeGreaterRealmAtmosphere({
      scene,
      haze,
      extinction: 0.5,
      inScattering: 0.5,
    });

    expect(extincted).toEqual([60, 50, 40]);
    expect(scattered[0]).toBeGreaterThan(scene[0]);
    expect(combined[0]).toBeGreaterThan(extincted[0]);
    expect(combined[0]).toBeLessThan(scattered[0]);
  });

  it('rejects malformed runtime color tuples instead of emitting NaN channels', () => {
    expect(() =>
      compositeGreaterRealmAtmosphere({
        scene: [120, 100] as unknown as readonly [number, number, number],
        haze: [180, 200, 225],
        extinction: 0.5,
        inScattering: 0.5,
      }),
    ).toThrow('GREATER_REALM_ATMOSPHERE_COMPOSITE_INVALID');
    expect(() =>
      compositeGreaterRealmAtmosphere({
        scene: [120, 100, 80],
        haze: [180, 200] as unknown as readonly [number, number, number],
        extinction: 0.5,
        inScattering: 0.5,
      }),
    ).toThrow('GREATER_REALM_ATMOSPHERE_COMPOSITE_INVALID');
  });
});
