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
const full = { offsetX: -50, offsetY: 0, width: 100, height: 30 } as const;
const compact = { offsetX: -42, offsetY: 0, width: 84, height: 28 } as const;

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

function expectStationaryPlacement(
  placement: Readonly<{
    x: number;
    y: number;
    projectedAnchor: Readonly<{ x: number; y: number }>;
    layoutAnchor: Readonly<{ x: number; y: number }>;
  }>
) {
  expect(placement.x).toBe(placement.projectedAnchor.x);
  expect(placement.y).toBe(placement.projectedAnchor.y);
  expect(placement.layoutAnchor).toEqual(placement.projectedAnchor);
  expect(Math.hypot(
    placement.x - placement.projectedAnchor.x,
    placement.y - placement.projectedAnchor.y
  )).toBe(0);
}

describe('measured realm label layout', () => {
  it('defines direct castle identity as a zero-displacement foundation anchor', () => {
    expect(REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS).toBe(0);

    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        x: 130,
        y: 120,
        measurements: {
          full: { offsetX: -45.5, offsetY: 0, width: 91, height: 27 }
        }
      })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [{ left: 20, top: 20, right: 80, bottom: 80 }],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toHaveLength(1);
    expectStationaryPlacement(result.placements[0]);
    expect(result.placements[0].bounds).toEqual({
      left: 84.5,
      top: 120,
      right: 175.5,
      bottom: 147
    });
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
    result.placements.forEach(expectStationaryPlacement);
    expect(result.culled.filter((entry) => entry.reason === 'capacity')).toHaveLength(2);
  });

  it('culls mandatory identity when its exact base anchor is reserved instead of rescuing it elsewhere', () => {
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

  it('does not search detached screen space when a narrow opening excludes the exact anchor', () => {
    const reserved = { left: 150, top: 150, right: 250, bottom: 210 } as const;
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'hovered', x: 200, y: 160 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [reserved],
      mandatoryCastleIds: [1],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toEqual([]);
    expect(result.culled).toEqual([{ castleId: 1, reason: 'reserved-ui' }]);
  });

  it('keeps the higher-priority identity stationary and culls a same-anchor collision for clustering', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { priority: 'own', x: 200, y: 160 }),
        candidate(2, { priority: 'selected', x: 200, y: 160 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 2,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({
      castleId: 2,
      presentation: 'full',
      x: 200,
      y: 160,
      projectedAnchor: { x: 200, y: 160 }
    });
    expectStationaryPlacement(result.placements[0]);
    expect(result.culled).toEqual([{ castleId: 1, reason: 'collision' }]);
  });

  it('attempts all 100 bounded candidates and never moves an accepted identity', () => {
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
    result.placements.forEach(expectStationaryPlacement);
    expect(result.culled.some((entry) => entry.reason === 'capacity')).toBe(false);
    expect(result.culled.some((entry) => entry.reason === 'collision')).toBe(true);
  });

  it('bounds deterministic 100-castle work without weakening closed geometry checks', () => {
    const denseViewport = { left: 0, top: 0, right: 1_000, bottom: 760 } as const;
    const anchors = Array.from({ length: 100 }, (_, index) => {
      const x = 320 + (index % 10) * 30;
      const y = 210 + Math.floor(index / 10) * 30;
      return candidate(index + 1, {
        x,
        y,
        distance: index,
        // A foundation-base label begins below the castle silhouette.
        occlusionBounds: { left: x - 20, top: y - 52, right: x + 20, bottom: y - 4 }
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
      expectStationaryPlacement(placement);
      input.protectedCastleSilhouettes.forEach((silhouette) => {
        if (silhouette.castleId !== placement.castleId) {
          expect(overlaps(placement.bounds, silhouette.bounds)).toBe(false);
        }
      });
    });
    expect(work.proposalEvaluations).toBeLessThanOrEqual(70_000);
    expect(work.rectangleIntersectionEvaluations).toBeLessThanOrEqual(180_000);
  });

  it('keeps text-bearing compact presentation at the same foundation anchor for far identities', () => {
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        priority: 'far',
        x: 200,
        y: 160,
        measurements: {
          full: { offsetX: -100, offsetY: 0, width: 200, height: 40 },
          compact
        }
      })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });

    expect(result.placements[0]).toMatchObject({
      presentation: 'compact',
      x: 200,
      y: 160,
      projectedAnchor: { x: 200, y: 160 }
    });
    expectStationaryPlacement(result.placements[0]);
    expect(result.placements[0].bounds).toEqual({
      left: 158,
      top: 160,
      right: 242,
      bottom: 188
    });
  });

  it('retains a prior member across small distance-order jitter without retaining stale coordinates', () => {
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
        candidate(1, { x: 81, distance: 10.25 }),
        candidate(2, { x: 280, distance: 10.2 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      previousPlacements: first.placements,
      hysteresis: { membershipDistance: 0.1, anchorJitterPixels: 2 }
    });
    const beyondHysteresis = resolveMeasuredRealmLabelLayout({
      anchors: [
        candidate(1, { x: 82, distance: 10.5 }),
        candidate(2, { x: 280, distance: 10.2 })
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      previousPlacements: jittered.placements,
      hysteresis: { membershipDistance: 0.1, anchorJitterPixels: 2 }
    });

    expect(first.placements[0].castleId).toBe(1);
    expect(jittered.placements[0]).toMatchObject({ castleId: 1, x: 81 });
    expectStationaryPlacement(jittered.placements[0]);
    expect(beyondHysteresis.placements[0].castleId).toBe(2);
    expectStationaryPlacement(beyondHysteresis.placements[0]);
  });

  it('culls safe-area edge anchors instead of nudging them inward', () => {
    const blocked = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'selected', x: 50 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });
    const exactCompact = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'near', x: 52 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });
    const detached = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { priority: 'near', x: 15 })],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1
    });

    expect(blocked.placements).toEqual([]);
    expect(blocked.culled).toEqual([{ castleId: 1, reason: 'no-safe-placement' }]);
    expect(exactCompact.placements[0]).toMatchObject({
      presentation: 'compact',
      x: 52,
      projectedAnchor: { x: 52, y: 120 }
    });
    expectStationaryPlacement(exactCompact.placements[0]);
    expect(detached.placements).toEqual([]);
    expect(detached.culled).toEqual([{ castleId: 1, reason: 'no-safe-placement' }]);
  });

  it('culls a username that would cross a foreign castle instead of moving it', () => {
    const ownCastleBounds = { left: 60, top: 40, right: 140, bottom: 110 };
    const neighboringCastleBounds = { left: 60, top: 110, right: 140, bottom: 170 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        x: 100,
        y: 120,
        occlusionBounds: ownCastleBounds,
        measurements: { full, compact: full }
      })],
      protectedCastleSilhouettes: [
        { castleId: 1, bounds: ownCastleBounds },
        { castleId: 2, bounds: neighboringCastleBounds }
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toEqual([]);
    expect(result.culled).toEqual([{ castleId: 1, reason: 'foreign-castle' }]);
  });

  it('accepts an exact foundation anchor beneath its own projected silhouette', () => {
    const ownBounds = { left: 140, top: 80, right: 260, bottom: 210 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        x: 200,
        y: 220,
        occlusionBounds: ownBounds
      })],
      protectedCastleSilhouettes: [{ castleId: 1, bounds: ownBounds }],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toHaveLength(1);
    expectStationaryPlacement(result.placements[0]);
    expect(result.placements[0].bounds.top).toBe(220);
    expect(overlaps(result.placements[0].bounds, ownBounds)).toBe(false);
  });

  it('culls an anchor that crosses its own castle instead of using a compact offset', () => {
    const ownBounds = { left: 150, top: 100, right: 250, bottom: 220 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, {
        x: 200,
        y: 210,
        occlusionBounds: ownBounds
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

  it('retains foreign ownership when two castles share identical projected bounds', () => {
    const sharedBounds = { left: 150, top: 110, right: 250, bottom: 150 };
    const result = resolveMeasuredRealmLabelLayout({
      anchors: [candidate(1, { x: 200, y: 120, occlusionBounds: undefined })],
      protectedCastleSilhouettes: [
        { castleId: 1, bounds: sharedBounds },
        { castleId: 2, bounds: sharedBounds }
      ],
      viewportBounds: viewport,
      safeAreaBounds: safeArea,
      reservedUiRects: [],
      maximumLabels: 1,
      collisionPaddingPixels: 0
    });

    expect(result.placements).toEqual([]);
    expect(result.culled).toEqual([{ castleId: 1, reason: 'foreign-castle' }]);
  });
});
