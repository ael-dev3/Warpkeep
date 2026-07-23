import { describe, expect, it } from 'vitest';

import { axialToWorld, hexDistance } from '../src/game/map/hexCoordinates';
import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import {
  createRealmForestCellCache,
  estimateRealmForestViewportRadiusCells,
  materializeRealmForestActiveWindow,
  REALM_FOREST_ACTIVE_WINDOW_PLANS,
  resolveRealmForestWindowDescriptor,
  shouldMaterializeRealmForestWindow
} from '../src/components/realm/realmForestActiveWindow';

describe('bounded decorative forest active window', () => {
  it('estimates a conservative viewport footprint in hex cells', () => {
    const camera = {
      position: { x: 0, y: 10, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      focus: { x: 0, z: 0 },
      verticalFovDegrees: 30,
      aspect: 16 / 9,
      minimumGroundY: 0
    };
    const landscape = estimateRealmForestViewportRadiusCells(camera, 1);
    const portrait = estimateRealmForestViewportRadiusCells({
      ...camera,
      aspect: 9 / 16
    }, 1);
    expect(landscape).toBeGreaterThan(7);
    expect(portrait).toBeGreaterThan(5);
    expect(landscape).toBeGreaterThan(portrait);
    expect(estimateRealmForestViewportRadiusCells(camera, 2)).toBeLessThan(
      landscape
    );
    expect(estimateRealmForestViewportRadiusCells(
      { ...camera, verticalFovDegrees: Number.POSITIVE_INFINITY }
    )).toBe(Number.POSITIVE_INFINITY);
    expect(estimateRealmForestViewportRadiusCells({
      ...camera,
      position: camera.target
    }))
      .toBe(Number.POSITIVE_INFINITY);
    expect(estimateRealmForestViewportRadiusCells({
      ...camera,
      target: { x: 0, y: 10, z: 0 }
    }))
      .toBe(Number.POSITIVE_INFINITY);
  });

  it('keeps every materialized quality window within its cache boundary', () => {
    Object.values(REALM_FOREST_ACTIVE_WINDOW_PLANS).forEach((plan) => {
      const maximumCellCount = 1
        + 3 * plan.activeRadius * (plan.activeRadius + 1);
      expect(maximumCellCount).toBeLessThanOrEqual(plan.cacheLimit);
    });
  });

  it('hides at overview without resolving an anchor or materializing cells', () => {
    const map = generateRealmTerrainMap('forest-window', 40);
    const descriptor = resolveRealmForestWindowDescriptor(
      { x: 0, z: 0 },
      'realm',
      REALM_FOREST_ACTIVE_WINDOW_PLANS.high,
      { radiusCells: 0 }
    );
    expect(descriptor).toMatchObject({
      anchor: null,
      reveal: 0,
      overviewHidden: true
    });
    expect(materializeRealmForestActiveWindow(
      map,
      descriptor,
      REALM_FOREST_ACTIVE_WINDOW_PLANS.high
    ).cells).toEqual([]);
  });

  it('keeps a wide approach hidden until the fixed window covers the viewport', () => {
    const map = generateRealmTerrainMap('forest-window-wide-approach', 40);
    const plan = REALM_FOREST_ACTIVE_WINDOW_PLANS.high;
    const wide = resolveRealmForestWindowDescriptor(
      axialToWorld({ q: 3, r: -2 }, 1),
      'approach',
      plan,
      { radiusCells: plan.activeRadius }
    );
    expect(wide.anchor).toEqual({ q: 3, r: -2 });
    expect(wide.reveal).toBe(0);
    expect(wide.overviewHidden).toBe(true);
    expect(materializeRealmForestActiveWindow(map, wide, plan).cells).toEqual([]);
    expect(resolveRealmForestWindowDescriptor(
      { x: Number.NaN, z: 0 },
      'keep',
      plan,
      { radiusCells: 0 }
    )).toMatchObject({ anchor: null, reveal: 0, overviewHidden: true });
    expect(resolveRealmForestWindowDescriptor(
      { x: 0, z: 0 },
      'keep',
      plan,
      { radiusCells: -1 }
    )).toMatchObject({ reveal: 0, overviewHidden: true });
  });

  it('quantizes reveal across the edge margin and bounds the materialized disc', () => {
    const map = generateRealmTerrainMap('forest-window-reveal', 40);
    const plan = REALM_FOREST_ACTIVE_WINDOW_PLANS.high;
    const descriptorFor = (radiusCells: number) => resolveRealmForestWindowDescriptor(
      axialToWorld({ q: 3, r: -2 }, 1),
      'keep',
      plan,
      { radiusCells }
    );
    expect(descriptorFor(14).reveal).toBe(0);
    expect(descriptorFor(13.76).reveal).toBe(0);
    expect(descriptorFor(13.75).reveal).toBe(0.125);
    expect(descriptorFor(13).reveal).toBe(0.5);
    expect(descriptorFor(12).reveal).toBe(1);
    expect(descriptorFor(0).reveal).toBe(1);

    const active = materializeRealmForestActiveWindow(map, descriptorFor(12), plan);
    expect(active.overviewHidden).toBe(false);
    expect(active.cells.length).toBeLessThanOrEqual(1 + 3 * 14 * 15);
    expect(active.cells.every(({ cell }) => hexDistance(cell.coord, active.anchor!) <= 14)).toBe(true);
  });

  it('compares descriptor hysteresis before any terrain-cell materialization', () => {
    const plan = REALM_FOREST_ACTIVE_WINDOW_PLANS.balanced;
    const descriptorFor = (q: number, radiusCells = 8) => resolveRealmForestWindowDescriptor(
      axialToWorld({ q, r: 0 }, 1),
      'keep',
      plan,
      { radiusCells }
    );
    const first = descriptorFor(0);
    const oneCell = descriptorFor(1);
    const threshold = descriptorFor(2);
    const strongerReveal = descriptorFor(0, 7);
    expect('cells' in first).toBe(false);
    expect(shouldMaterializeRealmForestWindow(first, oneCell, plan)).toBe(false);
    expect(shouldMaterializeRealmForestWindow(first, threshold, plan)).toBe(true);
    expect(shouldMaterializeRealmForestWindow(first, strongerReveal, plan)).toBe(false);

    const wideFirst = descriptorFor(0, plan.activeRadius);
    const wideFarAway = descriptorFor(12, plan.activeRadius);
    expect(wideFirst.overviewHidden).toBe(true);
    expect(shouldMaterializeRealmForestWindow(wideFirst, wideFarAway, plan)).toBe(false);
    expect(shouldMaterializeRealmForestWindow(wideFirst, descriptorFor(12, 8), plan)).toBe(true);
  });

  it('keeps the cell cache bounded and refreshes recently read entries', () => {
    const cache = createRealmForestCellCache<number>(3);
    cache.set('first', 1);
    cache.set('second', 2);
    cache.set('third', 3);
    expect(cache.get('first')).toBe(1);
    cache.set('fourth', 4);
    expect(cache.size).toBe(3);
    expect(cache.limit).toBe(3);
    expect(cache.get('second')).toBeUndefined();
    expect(cache.get('first')).toBe(1);
    expect(cache.get('fourth')).toBe(4);
    cache.dispose();
    expect(cache.size).toBe(0);
  });
});
