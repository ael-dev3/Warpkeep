import { describe, expect, it } from 'vitest';

import {
  REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS,
  resolveMeasuredRealmLabelLayout as resolveMeasuredRealmLabelLayoutCore,
  type RealmMeasuredLabelLayoutInput,
  type RealmMeasuredLabelLayoutWorkCounter,
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

type RealmMeasuredLabelLayoutTestInput = Omit<
  RealmMeasuredLabelLayoutInput,
  'protectedCastleSilhouettes'
> & Partial<Pick<RealmMeasuredLabelLayoutInput, 'protectedCastleSilhouettes'>>;

function resolveMeasuredRealmLabelLayout(
  input: RealmMeasuredLabelLayoutTestInput,
  workCounter?: RealmMeasuredLabelLayoutWorkCounter
) {
  return resolveMeasuredRealmLabelLayoutCore({
    ...input,
    protectedCastleSilhouettes: input.protectedCastleSilhouettes ?? []
  }, workCounter);
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
    const anchors = [
      candidate(1, { priority: 'near', x: 200, y: 160 }),
      candidate(2, { priority: 'hovered', x: 200, y: 160 })
    ];
    const input = {
      anchors,
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [denseRoofArea],
      mandatoryCastleIds: [2],
      collisionPaddingPixels: 0
    } as const;
    const baseline = resolveMeasuredRealmLabelLayout({
      ...input,
      maximumLabels: 1
    });
    const result = resolveMeasuredRealmLabelLayout({
      ...input,
      maximumLabels: 2
    });

    expect(result.placements.map((placement) => placement.castleId)).toEqual([2, 1]);
    // Dense rescue is monotonic: it appends the recovered identity without
    // moving the already-accepted direct-intent placement.
    expect(result.placements[0]).toEqual(baseline.placements[0]);
    const hovered = result.placements.find((placement) => placement.castleId === 2)!;
    expect(overlaps(hovered.bounds, denseRoofArea)).toBe(false);
    expect(Math.hypot(
      hovered.x - hovered.projectedAnchor.x,
      hovered.y - hovered.projectedAnchor.y
    )).toBeGreaterThan(40);
    expect(Math.hypot(
      hovered.x - hovered.projectedAnchor.x,
      hovered.y - hovered.projectedAnchor.y
    )).toBeLessThanOrEqual(REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS);
    expect(hovered.layoutAnchor).toEqual({ x: 200, y: 160 });
    const rescued = result.placements.find((placement) => placement.castleId === 1)!;
    expect(rescued.presentation).toBe('compact');
    expect(overlaps(rescued.bounds, denseRoofArea)).toBe(false);
    expect(overlaps(rescued.bounds, hovered.bounds)).toBe(false);
    expect(Math.hypot(
      rescued.x - rescued.projectedAnchor.x,
      rescued.y - rescued.projectedAnchor.y
    )).toBeLessThanOrEqual(REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS);
    expect(result.culled).toEqual([]);
  });

  it('culls mandatory identity placement when only detached safe space remains', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'selected', x: 100, y: 160 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [{ left: 0, top: 0, right: 260, bottom: 300 }],
      mandatoryCastleIds: [1],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toEqual([]);
    expect(result.culled).toEqual([{ castleId: 1, reason: 'reserved-ui' }]);
  });

  it('finds a narrow safe roof berth for direct intent without crossing protected UI', () => {
    const reservedUiRects = [
      { left: 10, top: 10, right: 146, bottom: 290 },
      { left: 246, top: 10, right: 390, bottom: 290 },
      { left: 146, top: 10, right: 246, bottom: 188 },
      { left: 146, top: 218, right: 246, bottom: 290 }
    ] as const;
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'hovered', x: 200, y: 160 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects,
      mandatoryCastleIds: [1],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({
      castleId: 1,
      presentation: 'compact',
      x: 196,
      y: 218,
      projectedAnchor: { x: 200, y: 160 },
      layoutAnchor: { x: 200, y: 160 }
    });
    reservedUiRects.forEach((reserved) => {
      expect(overlaps(result.placements[0].bounds, reserved)).toBe(false);
    });
    expect(Math.hypot(
      result.placements[0].x - result.placements[0].projectedAnchor.x,
      result.placements[0].y - result.placements[0].projectedAnchor.y
    )).toBeLessThanOrEqual(REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS);
    expect(result.culled).toEqual([]);
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
    result.placements.forEach((placement) => {
      expect(Math.hypot(
        placement.x - placement.projectedAnchor.x,
        placement.y - placement.projectedAnchor.y
      )).toBeLessThanOrEqual(REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS);
    });
    expect(result.culled.some((entry) => entry.reason === 'capacity')).toBe(false);
    expect(result.culled.some((entry) => entry.reason === 'collision')).toBe(true);
  });

  it('bounds dense-rescue work for 100 castles without weakening closed geometry checks', () => {
    const denseViewport = { left: 0, top: 0, right: 1_000, bottom: 760 } as const;
    const anchors = Array.from({ length: 100 }, (_, index) => {
      const x = 320 + (index % 10) * 30;
      const y = 210 + Math.floor(index / 10) * 30;
      return candidate(index + 1, {
        x,
        y,
        distance: index,
        occlusionBounds: { left: x - 20, top: y + 4, right: x + 20, bottom: y + 52 }
      });
    });
    const input = {
      anchors,
      protectedCastleSilhouettes: anchors.map((anchor) => ({
        castleId: anchor.castleId,
        bounds: anchor.occlusionBounds!
      })),
      viewportBounds: denseViewport,
      safeAreaBounds: { left: 10, top: 10, right: 990, bottom: 750 },
      reservedUiRects: [{ left: 0, top: 0, right: 160, bottom: 110 }],
      maximumLabels: 100,
      collisionPaddingPixels: 2
    } as const;
    const work = {
      proposalEvaluations: 0,
      rectangleIntersectionEvaluations: 0
    };
    const result = resolveMeasuredRealmLabelLayout(input, work);
    const repeated = resolveMeasuredRealmLabelLayout(input);

    expect(repeated).toEqual(result);
    expect(result.placements.length + result.culled.length).toBe(100);
    expect(result.culled.some((entry) => entry.reason === 'capacity')).toBe(false);
    result.placements.forEach((placement) => {
      input.protectedCastleSilhouettes.forEach((silhouette) => {
        if (silhouette.castleId !== placement.castleId) {
          expect(overlaps(placement.bounds, silhouette.bounds)).toBe(false);
        }
      });
    });
    // Structural limits stay stable across CI hardware and catch the former
    // million-plus dense-bucket scan without relying on a wall-clock timeout.
    expect(work.proposalEvaluations).toBeLessThanOrEqual(70_000);
    expect(work.rectangleIntersectionEvaluations).toBeLessThanOrEqual(180_000);
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

  it('moves a direct username above a foreign castle silhouette', () => {
    const firstCastleBounds = { left: 60, top: 125, right: 140, bottom: 200 };
    const neighboringCastleBounds = { left: 60, top: 90, right: 140, bottom: 170 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, {
          x: 100,
          y: 120,
          distance: 1,
          occlusionBounds: firstCastleBounds,
          measurements: { full, compact: full }
        }),
        candidate(2, {
          x: 100,
          y: 84,
          distance: 2,
          occlusionBounds: neighboringCastleBounds,
          measurements: { full, compact: full }
        })
      ],
      protectedCastleSilhouettes: [
        { castleId: 1, bounds: firstCastleBounds },
        { castleId: 2, bounds: neighboringCastleBounds }
      ],
      viewportBounds: viewport,
      safeAreaBounds: { left: 0, top: 0, right: 400, bottom: 300 },
      reservedUiRects: [],
      maximumLabels: 2,
      collisionPaddingPixels: 0
    });

    const first = result.placements.find((placement) => placement.castleId === 1)!;
    expect(first).toMatchObject({
      x: 100,
      y: 70,
      projectedAnchor: { x: 100, y: 120 },
      layoutAnchor: { x: 100, y: 120 }
    });
    expect(overlaps(first.bounds, neighboringCastleBounds)).toBe(false);
    expect(Math.hypot(
      first.x - first.projectedAnchor.x,
      first.y - first.projectedAnchor.y
    )).toBeLessThanOrEqual(REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS);
    result.placements.forEach((placement) => {
      const foreignBounds = placement.castleId === 1
        ? neighboringCastleBounds
        : firstCastleBounds;
      expect(overlaps(placement.bounds, foreignBounds)).toBe(false);
    });
  });

  it('uses the calibrated own occlusion bounds instead of treating its protected shape as foreign', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        x: 200,
        y: 120,
        occlusionBounds: { left: 160, top: 125, right: 240, bottom: 210 }
      })],
      protectedCastleSilhouettes: [{
        castleId: 1,
        bounds: { left: 140, top: 80, right: 260, bottom: 210 }
      }],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({
      castleId: 1,
      x: 200,
      y: 120,
      projectedAnchor: { x: 200, y: 120 }
    });
  });

  it('retains foreign ownership when two castles share identical projected bounds', () => {
    const sharedBounds = { left: 150, top: 90, right: 250, bottom: 130 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { x: 200, y: 120, occlusionBounds: undefined })],
      protectedCastleSilhouettes: [
        { castleId: 1, bounds: sharedBounds },
        { castleId: 2, bounds: sharedBounds }
      ],
      viewportBounds: viewport,
      safeAreaBounds: { left: 150, top: 90, right: 250, bottom: 120 },
      reservedUiRects: [],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toEqual([]);
    expect(result.culled).toEqual([{ castleId: 1, reason: 'foreign-castle' }]);
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
