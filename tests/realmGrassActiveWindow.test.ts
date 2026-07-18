import { describe, expect, it } from 'vitest';

import {
  createRealmGrassCellCache,
  realmGrassWindowKey,
  resolveRealmGrassActiveWindow,
  shouldRepackRealmGrassWindow
} from '../src/components/realm/realmGrassActiveWindow';
import { REALM_GRASS_RENDER_PLANS } from '../src/components/realm/realmQuality';
import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import { axialToWorld, hexDistance } from '../src/game/map/hexCoordinates';

describe('procedural grass active window', () => {
  it('pins the quality-owned active radii, instance/triangle ceilings, and wind cadences', () => {
    expect(Object.fromEntries(Object.entries(REALM_GRASS_RENDER_PLANS).map(([quality, plan]) => [
      quality,
      {
        activeRadius: plan.activeRadius,
        maximumActiveInstances: plan.maximumActiveInstances,
        maximumActiveTriangles: plan.maximumActiveTriangles,
        animationFrameCap: plan.animationFrameCap
      }
    ]))).toEqual({
      high: {
        activeRadius: 12,
        maximumActiveInstances: 14_000,
        maximumActiveTriangles: 210_000,
        animationFrameCap: 24
      },
      balanced: {
        activeRadius: 9,
        maximumActiveInstances: 7_000,
        maximumActiveTriangles: 84_000,
        animationFrameCap: 16
      },
      reduced: {
        activeRadius: 6,
        maximumActiveInstances: 2_000,
        maximumActiveTriangles: 18_000,
        animationFrameCap: 0
      }
    });
  });

  it('suppresses all grass in the full realm overview', () => {
    const map = generateRealmTerrainMap('grass-overview', 16);
    const hidden = resolveRealmGrassActiveWindow(
      map,
      axialToWorld({ q: 3, r: -2 }, 1),
      'realm',
      REALM_GRASS_RENDER_PLANS.high
    );

    expect(hidden).toEqual({
      mode: 'realm',
      anchor: null,
      cells: [],
      overviewHidden: true
    });
    expect(realmGrassWindowKey(hidden)).toBe('realm:hidden');
  });

  it('uses an axial disc centered on the nearest camera cell and fades its edge', () => {
    const map = generateRealmTerrainMap('grass-local-window', 20);
    const anchor = { q: 3, r: -2 } as const;
    const window = resolveRealmGrassActiveWindow(
      map,
      {
        ...axialToWorld(anchor, 1),
        x: axialToWorld(anchor, 1).x + 0.08
      },
      'approach',
      REALM_GRASS_RENDER_PLANS.high
    );

    expect(window.mode).toBe('approach');
    expect(window.overviewHidden).toBe(false);
    expect(window.anchor).toEqual(anchor);
    expect(window.cells).toHaveLength(1 + 3 * 12 * 13);
    expect(window.cells.every(({ cell }) => (
      hexDistance(cell.coord, anchor) <= REALM_GRASS_RENDER_PLANS.high.activeRadius
    ))).toBe(true);

    const center = window.cells.find(({ cell }) => cell.coord.q === anchor.q && cell.coord.r === anchor.r);
    const edge = window.cells.find(({ cell }) => (
      hexDistance(cell.coord, anchor) === REALM_GRASS_RENDER_PLANS.high.activeRadius
    ));
    expect(center?.edgeFade).toBe(1);
    expect(edge?.edgeFade).toBe(0);
    expect(realmGrassWindowKey(window)).toBe('approach:3,-2');
  });

  it('rebuilds only after the hysteresis threshold or a camera-mode change', () => {
    const map = generateRealmTerrainMap('grass-hysteresis', 12);
    const plan = REALM_GRASS_RENDER_PLANS.high;
    const previous = resolveRealmGrassActiveWindow(
      map,
      axialToWorld({ q: 0, r: 0 }, 1),
      'keep',
      plan
    );
    const oneCellAway = resolveRealmGrassActiveWindow(
      map,
      axialToWorld({ q: 1, r: 0 }, 1),
      'keep',
      plan
    );
    const thresholdAway = resolveRealmGrassActiveWindow(
      map,
      axialToWorld({ q: 2, r: 0 }, 1),
      'keep',
      plan
    );
    const changedMode = resolveRealmGrassActiveWindow(
      map,
      axialToWorld({ q: 1, r: 0 }, 1),
      'approach',
      plan
    );

    expect(shouldRepackRealmGrassWindow(null, previous, plan)).toBe(true);
    expect(shouldRepackRealmGrassWindow(previous, oneCellAway, plan)).toBe(false);
    expect(shouldRepackRealmGrassWindow(previous, thresholdAway, plan)).toBe(true);
    expect(shouldRepackRealmGrassWindow(previous, changedMode, plan)).toBe(true);
  });

  it('keeps the cell-generation cache bounded and evicts least-recently-used data', () => {
    const cache = createRealmGrassCellCache<string>(2);
    cache.set('first', 'a');
    cache.set('second', 'b');
    expect(cache.get('first')).toBe('a');
    cache.set('third', 'c');

    expect(cache.limit).toBe(2);
    expect(cache.size).toBe(2);
    expect(cache.get('second')).toBeUndefined();
    expect(cache.get('first')).toBe('a');
    expect(cache.get('third')).toBe('c');

    cache.dispose();
    cache.set('after-dispose', 'ignored');
    expect(cache.size).toBe(0);
    expect(cache.get('first')).toBeUndefined();
  });
});
