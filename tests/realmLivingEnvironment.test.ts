import { describe, expect, it } from 'vitest';

import {
  REALM_LIVING_GUST_GLSL,
  REALM_LIVING_WIND_GLSL,
  sampleRealmLivingEnvironment
} from '../src/components/realm/realmLivingEnvironment';
import { REALM_PREVAILING_WIND } from '../src/game/map/realmPrevailingWind';

describe('Living Realm environment contract', () => {
  it('samples one deterministic, normalized, bounded world-space gust', () => {
    const sample = { timeSeconds: -1, windX: 0, windZ: 0, gust: -1 };
    const first = { ...sampleRealmLivingEnvironment(12.5, 4, -7, sample) };
    const second = sampleRealmLivingEnvironment(12.5, 4, -7, sample);

    expect(second).toEqual(first);
    expect(second.windX).toBe(REALM_PREVAILING_WIND.x);
    expect(second.windZ).toBe(REALM_PREVAILING_WIND.z);
    expect(Math.hypot(second.windX, second.windZ)).toBeCloseTo(1, 12);
    expect(second.gust).toBeGreaterThanOrEqual(0);
    expect(second.gust).toBeLessThanOrEqual(1);
  });

  it('fails malformed time and positions to a finite deterministic sample', () => {
    const sample = { timeSeconds: -1, windX: 0, windZ: 0, gust: -1 };
    expect(sampleRealmLivingEnvironment(Number.NaN, Infinity, -Infinity, sample))
      .toEqual(sampleRealmLivingEnvironment(0, 0, 0, sample));
  });

  it('exports the same fixed wind and bounded function for shader consumers', () => {
    expect(REALM_LIVING_WIND_GLSL).toContain(REALM_PREVAILING_WIND.x.toFixed(9));
    expect(REALM_LIVING_GUST_GLSL).toContain('float realmLivingGust');
    expect(REALM_LIVING_GUST_GLSL).toContain('clamp(');
  });
});
