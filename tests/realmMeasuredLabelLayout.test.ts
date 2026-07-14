import { describe, expect, it } from 'vitest';

import {
  resolveMeasuredRealmLabelLayout,
  type RealmProjectedLabelAnchor,
  type RealmScreenRect
} from '../src/components/realm/realmMeasuredLabelLayout';

const viewport = { left: 0, top: 0, right: 400, bottom: 300 } as const;
const safeArea = { left: 10, top: 10, right: 390, bottom: 290 } as const;
const full = { offsetX: -50, offsetY: -30, width: 100, height: 30 } as const;
const avatar = { offsetX: -18, offsetY: -36, width: 36, height: 36 } as const;

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
    measurements: { full, avatar },
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

  it('keeps full identity presentation for accepted far labels', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        priority: 'far',
        measurements: {
          full: { offsetX: -100, offsetY: -40, width: 200, height: 40 },
          avatar
        }
      })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });

    expect(result.placements[0].presentation).toBe('full');
    expect(result.placements[0].bounds.right - result.placements[0].bounds.left).toBe(200);
    expect(result.placements[0].bounds.bottom - result.placements[0].bounds.top).toBe(40);
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

  it('culls a lower-priority collision instead of detaching it from its castle', () => {
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

    expect(result.placements.map((placement) => placement.castleId)).toEqual([2]);
    expect(result.culled).toContainEqual({ castleId: 1, reason: 'collision' });
  });

  it('allows only a tightly bounded safe-area nudge for selected or own labels', () => {
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

    expect(selected.placements[0]).toMatchObject({ x: 60, y: 120 });
    expect(Math.hypot(
      selected.placements[0].x - selected.placements[0].projectedAnchor.x,
      selected.placements[0].y - selected.placements[0].projectedAnchor.y
    )).toBeLessThanOrEqual(12);
    expect(peer.placements).toEqual([]);
    expect(peer.culled).toEqual([{ castleId: 1, reason: 'no-safe-placement' }]);
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

  it('culls instead of moving a label down across its own castle silhouette', () => {
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

    expect(result.placements).toEqual([]);
    expect(result.culled).toEqual([{ castleId: 1, reason: 'associated-castle' }]);
  });
});
