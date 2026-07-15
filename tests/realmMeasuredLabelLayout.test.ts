import { describe, expect, it } from 'vitest';

import {
  resolveMeasuredRealmLabelLayout,
  type RealmProjectedLabelAnchor,
  type RealmScreenRect
} from '../src/components/realm/realmMeasuredLabelLayout';

const viewport = { left: 0, top: 0, right: 400, bottom: 300 } as const;
const safeArea = { left: 10, top: 10, right: 390, bottom: 290 } as const;
const full = { offsetX: -50, offsetY: -30, width: 100, height: 30 } as const;
const compact = { offsetX: -42, offsetY: -28, width: 84, height: 28 } as const;

function candidate(
  castleId: number,
  overrides: Partial<RealmProjectedLabelAnchor> = {}
): RealmProjectedLabelAnchor {
  return {
    castleId,
    x: 100 + castleId * 10,
    y: 120,
    inFrontOfCamera: true,
    priority: 'near',
    distance: castleId,
    measurements: { full, compact },
    ...overrides
  };
}

function overlaps(first: RealmScreenRect, second: RealmScreenRect) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

describe('measured realm label layout', () => {
  it('uses measured rectangles and keeps every accepted label out of reserved UI', () => {
    const reserved = { left: 20, top: 20, right: 80, bottom: 80 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        x: 130,
        y: 120,
        measurements: {
          full: { offsetX: -45.5, offsetY: -27, width: 91, height: 27 }
        }
      })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [reserved],
      maximumLabels: 5,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({ x: 130, y: 120 });
    expect(result.placements[0].bounds.right - result.placements[0].bounds.left).toBe(91);
    expect(result.placements[0].bounds.bottom - result.placements[0].bounds.top).toBe(27);
    expect(overlaps(result.placements[0].bounds, reserved)).toBe(false);
  });

  it('culls anchors behind the camera, outside the viewport, or without measurements', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { inFrontOfCamera: false }),
        candidate(2, { x: -1 }),
        candidate(3, { measurements: {} })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 5
    });

    expect(result.placements).toEqual([]);
    expect(result.culled).toEqual(expect.arrayContaining([
      { castleId: 1, reason: 'behind-camera' },
      { castleId: 2, reason: 'offscreen' },
      { castleId: 3, reason: 'unmeasured' }
    ]));
  });

  it('places selected and own labels before near or far labels and respects the cap', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { priority: 'near', distance: 1, x: 40 }),
        candidate(2, { priority: 'far', distance: 0, x: 100 }),
        candidate(99, { priority: 'own', distance: 999, x: 220 }),
        candidate(100, { priority: 'selected', distance: 1_000, x: 340 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 2
    });

    expect(result.placements.map((placement) => placement.castleId)).toEqual([100, 99]);
    expect(result.culled.filter((entry) => entry.reason === 'capacity')).toHaveLength(2);
  });

  it('keeps a directly hovered identity visible with an explained bounded displacement', () => {
    const denseRoofArea = { left: 95, top: 30, right: 305, bottom: 195 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { priority: 'near', x: 200, y: 160 }),
        candidate(2, { priority: 'hovered', x: 200, y: 160 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [denseRoofArea],
      mandatoryCastleIds: [2],
      maximumLabels: 2,
      collisionPaddingPixels: 0
    });

    expect(result.placements.map((placement) => placement.castleId)).toContain(2);
    const hovered = result.placements.find((placement) => placement.castleId === 2)!;
    expect(overlaps(hovered.bounds, denseRoofArea)).toBe(false);
    expect(Math.hypot(
      hovered.x - hovered.projectedAnchor.x,
      hovered.y - hovered.projectedAnchor.y
    )).toBeGreaterThan(40);
    expect(hovered.layoutAnchor).toEqual({ x: 200, y: 160 });
    expect(result.culled).toContainEqual({ castleId: 1, reason: 'reserved-ui' });
  });

  it('attempts all 100 bounded candidates before collision culling', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: Array.from({ length: 100 }, (_, index) => candidate(index + 1, {
        x: 180 + (index % 5),
        y: 160 + (index % 3),
        distance: index
      })),
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 100
    });

    expect(result.placements.length + result.culled.length).toBe(100);
    expect(result.culled.some((entry) => entry.reason === 'capacity')).toBe(false);
    expect(result.culled.some((entry) => entry.reason === 'collision')).toBe(true);
  });

  it('keeps text-bearing compact identity presentation for accepted far mobile labels', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        priority: 'far',
        measurements: {
          full: { offsetX: -100, offsetY: -40, width: 200, height: 40 },
          compact
        }
      })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });

    expect(result.placements[0].presentation).toBe('compact');
    expect(result.placements[0].bounds.right - result.placements[0].bounds.left).toBe(84);
    expect(result.placements[0].bounds.bottom - result.placements[0].bounds.top).toBe(28);
  });

  it('prefers compact text-bearing presentation for far desktop identities', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        priority: 'far',
        measurements: {
          full: { offsetX: -100, offsetY: -40, width: 200, height: 40 },
          compact
        }
      })],
      viewportBounds: { left: 0, top: 0, right: 1_000, bottom: 700 },
      safeAreaBounds: { left: 10, top: 10, right: 990, bottom: 690 },
      reservedUiRects: [],
      maximumLabels: 1
    });

    expect(result.placements[0].presentation).toBe('compact');
  });

  it('retains a prior member across small distance-order jitter', () => {
    const first = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { x: 80, distance: 10 }),
        candidate(2, { x: 280, distance: 10.2 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      hysteresis: { membershipDistance: 0.1 }
    });
    const jittered = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { x: 80, distance: 10.25 }),
        candidate(2, { x: 280, distance: 10.2 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      previousPlacements: first.placements,
      hysteresis: { membershipDistance: 0.1 }
    });
    const beyondHysteresis = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { x: 80, distance: 10.5 }),
        candidate(2, { x: 280, distance: 10.2 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      previousPlacements: jittered.placements,
      hysteresis: { membershipDistance: 0.1 }
    });

    expect(first.placements[0].castleId).toBe(1);
    expect(jittered.placements[0].castleId).toBe(1);
    expect(beyondHysteresis.placements[0].castleId).toBe(2);
  });

  it('follows every projected camera position without freezing small anchor movement', () => {
    const first = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { x: 100 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      hysteresis: { anchorJitterPixels: 2 }
    });
    const jittered = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { x: 101 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      previousPlacements: first.placements,
      hysteresis: { anchorJitterPixels: 2 }
    });
    const moved = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { x: 103 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      previousPlacements: jittered.placements,
      hysteresis: { anchorJitterPixels: 2 }
    });

    expect(jittered.placements[0].x).toBe(101);
    expect(moved.placements[0].x).toBe(103);
  });

  it('culls rather than overlap a reserved region that consumes the safe area', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1)],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [safeArea],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toEqual([]);
    expect(result.culled).toEqual([{ castleId: 1, reason: 'reserved-ui' }]);
  });

  it('keeps an own castle identity in a compact, roof-attached berth after a selected collision', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { priority: 'own', x: 200, y: 160 }),
        candidate(2, { priority: 'selected', x: 200, y: 160 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 2
    });

    expect(result.placements.map((placement) => placement.castleId)).toEqual([2, 1]);
    expect(result.placements[0]).toMatchObject({
      castleId: 2,
      presentation: 'full',
      x: 200,
      y: 160
    });
    expect(result.placements[1]).toMatchObject({
      castleId: 1,
      presentation: 'compact',
      projectedAnchor: { x: 200, y: 160 },
      layoutAnchor: { x: 200, y: 160 },
      x: 200,
      y: 110
    });
    expect(overlaps(result.placements[0].bounds, result.placements[1].bounds)).toBe(false);
  });

  it('keeps compact collision fallbacks outside reserved UI and their own castle', () => {
    const reserved = { left: 150, top: 90, right: 250, bottom: 124 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, {
          priority: 'selected',
          x: 200,
          y: 170,
          occlusionBounds: { left: 165, top: 176, right: 235, bottom: 240 }
        }),
        candidate(2, {
          priority: 'own',
          x: 200,
          y: 170,
          occlusionBounds: { left: 165, top: 176, right: 235, bottom: 240 }
        })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [reserved],
      maximumLabels: 2,
      collisionPaddingPixels: 0
    });

    expect(result.placements.map((placement) => placement.castleId)).toEqual([1, 2]);
    expect(result.placements[1]).toMatchObject({ presentation: 'compact' });
    result.placements.forEach((placement) => {
      expect(overlaps(placement.bounds, reserved)).toBe(false);
      expect(overlaps(placement.bounds, { left: 165, top: 176, right: 235, bottom: 240 }))
        .toBe(false);
    });
  });

  it('uses bounded nudges and a roof-adjacent compact berth at the mobile edge', () => {
    const selected = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'selected', x: 50 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });
    const peer = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'near', x: 50 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });
    const detachedPeer = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'near', x: 15 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });

    expect(selected.placements[0]).toMatchObject({ x: 60, y: 120 });
    expect(Math.hypot(
      selected.placements[0].x - selected.placements[0].projectedAnchor.x,
      selected.placements[0].y - selected.placements[0].projectedAnchor.y
    )).toBeLessThanOrEqual(40);
    expect(peer.placements[0]).toMatchObject({
      presentation: 'compact',
      x: 52,
      y: 120
    });
    expect(detachedPeer.placements[0]).toMatchObject({
      presentation: 'compact',
      projectedAnchor: { x: 15, y: 120 },
      layoutAnchor: { x: 15, y: 120 },
      x: 73,
      y: 120
    });
    expect(detachedPeer.culled).toEqual([]);
  });

  it('retains a label directly above its own projected silhouette', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        x: 200,
        y: 93,
        occlusionBounds: { left: 150, top: 100, right: 250, bottom: 220 }
      })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements[0]).toMatchObject({ x: 200, y: 93 });
    expect(result.placements[0].bounds.bottom).toBe(93);
    expect(overlaps(
      result.placements[0].bounds,
      { left: 150, top: 100, right: 250, bottom: 220 }
    )).toBe(false);
  });

  it('uses a compact upward berth instead of crossing its own castle silhouette', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        x: 200,
        y: 110,
        occlusionBounds: { left: 150, top: 100, right: 250, bottom: 220 }
      })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({
      castleId: 1,
      presentation: 'compact',
      x: 200,
      y: 60
    });
    expect(overlaps(
      result.placements[0].bounds,
      { left: 150, top: 100, right: 250, bottom: 220 }
    )).toBe(false);
  });
});
