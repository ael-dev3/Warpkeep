import { describe, expect, it } from 'vitest';

import { foundingDistrictZoomForViewport } from '../src/components/realm/createRealmScene';

describe('founding district camera framing', () => {
  it('uses a closer radius-20 frame while preserving more width on narrow screens', () => {
    const legacyDesktop = foundingDistrictZoomForViewport(4, 16 / 9);
    const expandedDesktop = foundingDistrictZoomForViewport(20, 16 / 9);
    const expandedMobile = foundingDistrictZoomForViewport(20, 9 / 16);

    expect(legacyDesktop).toBeCloseTo(0.3);
    expect(expandedDesktop).toBeCloseTo(0.54);
    expect(expandedMobile).toBeLessThan(expandedDesktop);
    expect(expandedMobile).toBeGreaterThanOrEqual(0.12);
  });

  it('stays bounded for malformed radius and viewport inputs', () => {
    expect(foundingDistrictZoomForViewport(-100, 0)).toBeGreaterThanOrEqual(0.12);
    expect(foundingDistrictZoomForViewport(10_000, 10_000)).toBeLessThanOrEqual(0.54);
  });
});
