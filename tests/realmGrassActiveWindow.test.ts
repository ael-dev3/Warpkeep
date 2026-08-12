import { describe, expect, it } from 'vitest';

import {
  createRealmGrassCellCache,
  isRealmGrassMidRankAccepted,
  realmGrassWindowKey,
  resolveRealmGrassActiveWindow,
  resolveRealmGrassLodWeights,
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
        nearRadius: plan.nearRadius,
        maximumNearInstances: plan.maximumNearInstances,
        maximumMidInstances: plan.maximumMidInstances,
        maximumActiveInstances: plan.maximumActiveInstances,
        maximumActiveTriangles: plan.maximumActiveTriangles,
        animationFrameCap: plan.animationFrameCap
      }
    ]))).toEqual({
      high: {
        activeRadius: 12,
        nearRadius: 7,
        maximumNearInstances: 4_800,
        maximumMidInstances: 2_200,
        maximumActiveInstances: 7_000,
        maximumActiveTriangles: 252_000,
        animationFrameCap: 24
      },
      balanced: {
        activeRadius: 9,
        nearRadius: 5,
        maximumNearInstances: 2_700,
        maximumMidInstances: 1_300,
        maximumActiveInstances: 4_000,
        maximumActiveTriangles: 108_000,
        animationFrameCap: 16
      },
      reduced: {
        activeRadius: 6,
        nearRadius: 3,
        maximumNearInstances: 800,
        maximumMidInstances: 400,
        maximumActiveInstances: 1_200,
        maximumActiveTriangles: 18_000,
        animationFrameCap: 0
      }
    });
  });

  it('cross-fades the same stable roots between complementary near and mid LODs', () => {
    const plan = REALM_GRASS_RENDER_PLANS.high;
    expect(resolveRealmGrassLodWeights(plan, 0)).toEqual({
      nearCoverage: 1,
      midCoverage: 0
    });
    const transition = resolveRealmGrassLodWeights(plan, plan.nearRadius);
    expect(transition.nearCoverage).toBeCloseTo(0.5, 10);
    expect(transition.midCoverage).toBeCloseTo(0.5, 10);
    expect(transition.nearCoverage + transition.midCoverage).toBeCloseTo(1, 10);
    expect(resolveRealmGrassLodWeights(plan, plan.activeRadius - 1).nearCoverage).toBe(0);

    const ranks = [0, 0x1fffffff, 0x7fffffff, 0xffffffff];
    const sparse = ranks.filter((rank) => isRealmGrassMidRankAccepted(rank, 0.25));
    const dense = ranks.filter((rank) => isRealmGrassMidRankAccepted(rank, 0.5));
    expect(sparse).toEqual([0, 0x1fffffff]);
    expect(dense).toEqual([0, 0x1fffffff, 0x7fffffff]);
    expect(sparse.every((rank) => dense.includes(rank))).toBe(true);
    expect(isRealmGrassMidRankAccepted(0, 0)).toBe(false);
    expect(isRealmGrassMidRankAccepted(0xffffffff, 1)).toBe(true);
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
