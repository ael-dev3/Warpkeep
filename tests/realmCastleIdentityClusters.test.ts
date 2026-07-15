import { describe, expect, it } from 'vitest';

import {
  REALM_IDENTITY_CLUSTER_HEIGHT,
  REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS,
  REALM_IDENTITY_CLUSTER_WIDTH,
  resolveRealmCastleIdentityClusters,
  type RealmCastleIdentityClusterPlacementDiagnostics
} from '../src/components/realm/realmCastleIdentityClusters';
import type { RealmCastleScreenProjection } from '../src/components/realm/realmTypes';
import type { RealmScreenRect } from '../src/components/realm/realmMeasuredLabelLayout';

const safeArea = { left: 0, top: 0, right: 600, bottom: 400 } as const;

function projection(castleId: number, x: number, y: number): RealmCastleScreenProjection {
  return {
    castleId,
    q: castleId,
    r: -castleId,
    x,
    y,
    distance: castleId,
    visible: true
  };
}

function overlaps(first: RealmScreenRect, second: RealmScreenRect) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

describe('realm castle identity clusters', () => {
  it('deterministically accounts for every unlabelled eligible castle without overlap', () => {
    const projections = [
      projection(1, 80, 100),
      projection(2, 96, 106),
      projection(3, 450, 100),
      projection(4, 466, 106),
      projection(5, 260, 300),
      projection(6, 276, 306)
    ];
    const occupied = { left: 210, top: 20, right: 330, bottom: 90 } as const;
    const resolve = (
      nextProjections: readonly RealmCastleScreenProjection[],
      castleIds: readonly number[]
    ) => resolveRealmCastleIdentityClusters({
      projections: nextProjections,
      clusterCastleIds: castleIds,
      safeAreaBounds: safeArea,
      occupiedRects: [occupied],
      maximumClusters: 2,
      collisionPaddingPixels: 4
    });

    const first = resolve(projections, [6, 5, 4, 3, 2, 1, 1]);
    const reordered = resolve([...projections].reverse(), [1, 2, 3, 4, 5, 6]);

    expect(reordered).toEqual(first);
    expect(first.clusters.length).toBeLessThanOrEqual(2);
    expect(first.clusters.flatMap((cluster) => cluster.castleIds).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6]);
    expect(first.overflowCastleIds).toEqual([]);
    first.clusters.forEach((cluster, index) => {
      expect(cluster.bounds.right - cluster.bounds.left).toBe(REALM_IDENTITY_CLUSTER_WIDTH);
      expect(cluster.bounds.bottom - cluster.bounds.top).toBe(REALM_IDENTITY_CLUSTER_HEIGHT);
      expect(cluster.bounds.left).toBeGreaterThanOrEqual(safeArea.left);
      expect(cluster.bounds.top).toBeGreaterThanOrEqual(safeArea.top);
      expect(cluster.bounds.right).toBeLessThanOrEqual(safeArea.right);
      expect(cluster.bounds.bottom).toBeLessThanOrEqual(safeArea.bottom);
      expect(overlaps(cluster.bounds, occupied)).toBe(false);
      first.clusters.slice(index + 1).forEach((other) => {
        expect(overlaps(cluster.bounds, other.bounds)).toBe(false);
      });
    });
  });

  it('preserves visible edge projections by clamping their cluster affordance into the safe area', () => {
    const layout = resolveRealmCastleIdentityClusters({
      projections: [projection(10, -20, 30), projection(11, 620, 420)],
      clusterCastleIds: [10, 11],
      safeAreaBounds: safeArea,
      occupiedRects: [],
      maximumClusters: 2
    });

    expect(layout.clusters.flatMap((cluster) => cluster.castleIds).sort((a, b) => a - b))
      .toEqual([10, 11]);
    expect(layout.overflowCastleIds).toEqual([]);
    layout.clusters.forEach((cluster) => {
      expect(cluster.bounds.left).toBeGreaterThanOrEqual(safeArea.left);
      expect(cluster.bounds.top).toBeGreaterThanOrEqual(safeArea.top);
      expect(cluster.bounds.right).toBeLessThanOrEqual(safeArea.right);
      expect(cluster.bounds.bottom).toBeLessThanOrEqual(safeArea.bottom);
    });
  });

  it('focuses the nearest cluster member while preferring a readable identity when available', () => {
    const projections = [
      projection(1, 100, 200),
      projection(2, 170, 200),
      projection(3, 290, 200)
    ];
    const resolve = (preferredRepresentativeCastleIds?: ReadonlySet<number>) => (
      resolveRealmCastleIdentityClusters({
        projections,
        clusterCastleIds: [3, 1, 2],
        preferredRepresentativeCastleIds,
        safeAreaBounds: safeArea,
        occupiedRects: [],
        maximumClusters: 1
      }).clusters[0]!
    );

    expect(resolve().representativeCastleId).toBe(2);
    expect(resolve(new Set([1, 3])).representativeCastleId).toBe(1);
    expect(resolve(new Set([999])).representativeCastleId).toBe(2);

    const reordered = resolveRealmCastleIdentityClusters({
      projections: [...projections].reverse(),
      clusterCastleIds: [2, 3, 1],
      preferredRepresentativeCastleIds: new Set([3, 1]),
      safeAreaBounds: safeArea,
      occupiedRects: [],
      maximumClusters: 1
    }).clusters[0]!;
    expect(reordered.representativeCastleId).toBe(1);
  });

  it.each([
    {
      name: 'narrow portrait',
      safe: { left: 8, top: 8, right: 382, bottom: 836 },
      occupied: [
        { left: 8, top: 8, right: 236, bottom: 156 },
        { left: 8, top: 774, right: 166, bottom: 836 }
      ]
    },
    {
      name: 'short landscape',
      safe: { left: 8, top: 8, right: 836, bottom: 382 },
      occupied: [
        { left: 8, top: 8, right: 236, bottom: 152 },
        { left: 552, top: 8, right: 836, bottom: 382 }
      ]
    }
  ])('accounts for a dense 100-castle $name viewport', ({ safe, occupied }) => {
    const projections = Array.from({ length: 100 }, (_, index) => projection(
      index + 1,
      (safe.left + safe.right) / 2 + (index % 10) * 3,
      (safe.top + safe.bottom) / 2 + Math.floor(index / 10) * 3
    ));
    const layout = resolveRealmCastleIdentityClusters({
      projections,
      clusterCastleIds: projections.map((castle) => castle.castleId),
      safeAreaBounds: safe,
      occupiedRects: occupied,
      maximumClusters: 3,
      collisionPaddingPixels: 4
    });
    const accounted = [
      ...layout.clusters.flatMap((cluster) => cluster.castleIds),
      ...layout.overflowCastleIds
    ].sort((a, b) => a - b);

    expect(accounted).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(new Set(accounted).size).toBe(100);
    expect(layout.clusters.length).toBeLessThanOrEqual(3);
    layout.clusters.forEach((cluster) => {
      occupied.forEach((rect) => expect(overlaps(cluster.bounds, rect)).toBe(false));
    });
  });

  it('routes every eligible castle to Explore when no touch-sized cluster can fit', () => {
    const layout = resolveRealmCastleIdentityClusters({
      projections: [projection(1, 20, 30), projection(2, 40, 35)],
      clusterCastleIds: [2, 1],
      safeAreaBounds: { left: 0, top: 0, right: 80, bottom: 40 },
      occupiedRects: [],
      maximumClusters: 2
    });

    expect(layout.clusters).toEqual([]);
    expect(layout.overflowCastleIds).toEqual([1, 2]);
  });

  it('bounds large-desktop candidate work and reuses one safe-area grid', () => {
    const largeDesktop = { left: 0, top: 0, right: 5_120, bottom: 2_880 } as const;
    const projections = Array.from({ length: 100 }, (_, index) => {
      const groupIndex = index % 12;
      const memberIndex = Math.floor(index / 12);
      return projection(
        index + 1,
        240 + (groupIndex % 6) * 650 + memberIndex * 2,
        240 + Math.floor(groupIndex / 6) * 1_200 + memberIndex * 2
      );
    });
    let diagnostics: RealmCastleIdentityClusterPlacementDiagnostics | undefined;
    const layout = resolveRealmCastleIdentityClusters({
      projections,
      clusterCastleIds: projections.map(({ castleId }) => castleId),
      safeAreaBounds: largeDesktop,
      occupiedRects: [largeDesktop],
      maximumClusters: 12,
      collisionPaddingPixels: 4,
      onPlacementDiagnostics: (nextDiagnostics) => {
        diagnostics = nextDiagnostics;
      }
    });

    expect(layout.clusters).toEqual([]);
    expect(layout.overflowCastleIds).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1)
    );
    expect(diagnostics).toBeDefined();
    expect(diagnostics!.safeAreaGridBuildCount).toBe(1);
    expect(diagnostics!.safeAreaGridPointCount)
      .toBeLessThanOrEqual(REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS);
    expect(diagnostics!.placementCandidateListCount).toBe(12);
    expect(diagnostics!.placementCandidateDedupeProbeCount).toBe(
      diagnostics!.placementCandidateListCount * (diagnostics!.safeAreaGridPointCount + 5)
    );
    expect(diagnostics!.placementCandidateCount).toBeLessThanOrEqual(
      diagnostics!.placementCandidateDedupeProbeCount
    );
    expect(diagnostics!.placementCandidateSortCount).toBeLessThanOrEqual(12 * 126);
    expect(diagnostics!.placementCandidateEvaluationCount)
      .toBe(diagnostics!.placementCandidateCount);
    expect(diagnostics!.placementCandidateEvaluationCount).toBeLessThanOrEqual(
      12 * (REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS + 5)
    );
  });
});
