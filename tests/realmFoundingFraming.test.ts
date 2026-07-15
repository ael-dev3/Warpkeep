import { describe, expect, it } from 'vitest';

import {
  foundingDistrictFocusForKeep,
  foundingDistrictZoomForViewport
} from '../src/components/realm/createRealmScene';
import { axialToWorld } from '../src/game/map/hexCoordinates';

describe('founding district camera framing', () => {
  it('uses a closer radius-20 frame and keeps portrait founders legible', () => {
    const legacyDesktop = foundingDistrictZoomForViewport(4, 16 / 9);
    const expandedDesktop = foundingDistrictZoomForViewport(20, 16 / 9);
    const expandedMobile = foundingDistrictZoomForViewport(20, 9 / 16);

    expect(legacyDesktop).toBeCloseTo(0.3);
    expect(expandedDesktop).toBeCloseTo(0.54);
    expect(expandedMobile).toBeGreaterThan(expandedDesktop);
    expect(expandedMobile).toBeCloseTo(0.5575, 4);
  });

  it('stays bounded for malformed radius and viewport inputs', () => {
    expect(foundingDistrictZoomForViewport(-100, 0)).toBeGreaterThanOrEqual(0.12);
    expect(foundingDistrictZoomForViewport(10_000, 10_000)).toBeLessThanOrEqual(0.54);
  });

  it('frames a late founder with local peers instead of the 100-player midpoint', () => {
    const lateCoord = { q: -18, r: 16 };
    const nearbyCoord = { q: -16, r: 14 };
    const late = axialToWorld(lateCoord, 1);
    const nearby = axialToWorld(nearbyCoord, 1);
    const focus = foundingDistrictFocusForKeep(lateCoord, [
      { castleId: 1, coord: { q: 0, r: 0 }, x: 0, groundY: 0, z: 0 },
      { castleId: 99, coord: nearbyCoord, x: nearby.x, groundY: 0.2, z: nearby.z },
      { castleId: 100, coord: lateCoord, x: late.x, groundY: 0.4, z: late.z }
    ], {
      x: late.x,
      y: 0.4,
      z: late.z,
      height: 1.62,
      footprintDiameter: 1.48
    });

    expect(focus.x).toBeCloseTo((nearby.x + late.x) / 2);
    expect(focus.z).toBeCloseTo((nearby.z + late.z) / 2);
    expect(focus.y).toBeCloseTo(0.3);
    expect(Math.hypot(focus.x, focus.z)).toBeGreaterThan(10);
  });
});
