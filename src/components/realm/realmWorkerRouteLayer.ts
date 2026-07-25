import * as THREE from 'three';

import type { HexWorldPosition } from '../../game/map/hexCoordinates';
import {
  resolveRealmWorkerRemainingRouteWorldPoints,
  type RealmWorkerSceneRecord
} from './realmWorkerRoutePresentation';

export const REALM_WORKER_ROUTE_BUDGET = Object.freeze({
  maximumVisibleRoutes: 24,
  maximumVisibleSegments: 512,
  maximumDrawCalls: 3,
  maximumTriangles: 0
});

export type RealmWorkerRouteLayerTelemetry = Readonly<{
  visibleRouteCount: number;
  visibleSegmentCount: number;
  selectedRouteCount: number;
  ownedRouteCount: number;
  peerRouteCount: number;
  drawCallCount: number;
  triangleCount: 0;
  rejectedRouteCount: number;
}>;

export type RealmWorkerRouteLayer = Readonly<{
  group: THREE.Group;
  canReconcile: (workers: readonly RealmWorkerSceneRecord[]) => boolean;
  reconcile: (workers: readonly RealmWorkerSceneRecord[]) => boolean;
  update: (nowMicros: bigint) => boolean;
  setHoveredWorkerId: (workerId: string | null) => void;
  setSelectedWorkerId: (workerId: string | null) => void;
  getTelemetry: () => RealmWorkerRouteLayerTelemetry;
  dispose: () => void;
}>;

type RealmWorkerRouteLayerOptions = Readonly<{
  workers: readonly RealmWorkerSceneRecord[];
  hexSize: number;
  heightAtWorld: (world: HexWorldPosition) => number;
}>;

type RouteStyle = 'selected' | 'owned' | 'peer';

type RouteCandidate = Readonly<{
  worker: RealmWorkerSceneRecord;
  points: readonly HexWorldPosition[];
  directionGlyph: readonly Readonly<{
    from: HexWorldPosition;
    to: HexWorldPosition;
  }>[];
  style: RouteStyle;
  priority: number;
}>;

const STYLE_ORDER = Object.freeze(['selected', 'owned', 'peer'] as const);
const STYLE_COLOR: Readonly<Record<RouteStyle, THREE.ColorRepresentation>> = Object.freeze({
  selected: '#fff0a8',
  owned: '#dab45b',
  peer: '#6d6885'
});
const STYLE_OPACITY: Readonly<Record<RouteStyle, number>> = Object.freeze({
  selected: 0.94,
  owned: 0.62,
  peer: 0.25
});
const ROUTE_GROUND_LIFT = 0.055;
const ROUTE_VERTEX_CAPACITY =
  REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 2;
const ROUTE_POSITION_COMPONENT_CAPACITY = ROUTE_VERTEX_CAPACITY * 3;

function sameStaticCatalog(
  current: readonly RealmWorkerSceneRecord[],
  next: readonly RealmWorkerSceneRecord[]
) {
  if (current.length !== next.length) return false;
  const nextById = new Map(next.map((worker) => [worker.workerId, worker] as const));
  return current.every((worker) => {
    const candidate = nextById.get(worker.workerId);
    return candidate !== undefined
      && candidate.ordinal === worker.ordinal
      && candidate.originCastleId === worker.originCastleId
      && candidate.originCoord.q === worker.originCoord.q
      && candidate.originCoord.r === worker.originCoord.r;
  });
}

function routeStyle(
  worker: RealmWorkerSceneRecord,
  selectedWorkerId: string | null,
  hoveredWorkerId: string | null
): Readonly<{ style: RouteStyle; priority: number }> {
  if (worker.workerId === selectedWorkerId) {
    return Object.freeze({ style: 'selected', priority: 0 });
  }
  if (worker.workerId === hoveredWorkerId) {
    return Object.freeze({ style: 'selected', priority: 1 });
  }
  if (worker.ownedByViewer) {
    return Object.freeze({ style: 'owned', priority: 2 });
  }
  return Object.freeze({ style: 'peer', priority: 3 });
}

function routeIsEligible(
  worker: RealmWorkerSceneRecord,
  selectedWorkerId: string | null,
  hoveredWorkerId: string | null
) {
  if (worker.status === 'outbound' || worker.status === 'returning') return true;
  return worker.status === 'gathering'
    && (worker.workerId === selectedWorkerId || worker.workerId === hoveredWorkerId);
}

function emptyTelemetry(): RealmWorkerRouteLayerTelemetry {
  return Object.freeze({
    visibleRouteCount: 0,
    visibleSegmentCount: 0,
    selectedRouteCount: 0,
    ownedRouteCount: 0,
    peerRouteCount: 0,
    drawCallCount: 0,
    triangleCount: 0,
    rejectedRouteCount: 0
  });
}

function routeDirectionGlyph(points: readonly HexWorldPosition[]) {
  const from = points.at(-2);
  const to = points.at(-1);
  if (!from || !to) return Object.freeze([]);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.000_001) return Object.freeze([]);
  const directionX = dx / length;
  const directionZ = dz / length;
  const perpendicularX = -directionZ;
  const perpendicularZ = directionX;
  const tip = Object.freeze({
    x: THREE.MathUtils.lerp(from.x, to.x, 0.76),
    z: THREE.MathUtils.lerp(from.z, to.z, 0.76)
  });
  const backDistance = Math.min(0.18, length * 0.24);
  const halfWidth = Math.min(0.11, length * 0.14);
  const back = Object.freeze({
    x: tip.x - directionX * backDistance,
    z: tip.z - directionZ * backDistance
  });
  return Object.freeze([
    Object.freeze({
      from: Object.freeze({
        x: back.x + perpendicularX * halfWidth,
        z: back.z + perpendicularZ * halfWidth
      }),
      to: tip
    }),
    Object.freeze({
      from: Object.freeze({
        x: back.x - perpendicularX * halfWidth,
        z: back.z - perpendicularZ * halfWidth
      }),
      to: tip
    })
  ]);
}

function createStyleLine(style: RouteStyle) {
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(
    new Float32Array(ROUTE_POSITION_COMPONENT_CAPACITY),
    3
  );
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  const lineDistanceAttribute = new THREE.BufferAttribute(
    new Float32Array(ROUTE_VERTEX_CAPACITY),
    1
  );
  lineDistanceAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('lineDistance', lineDistanceAttribute);
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineDashedMaterial({
    color: STYLE_COLOR[style],
    transparent: true,
    opacity: STYLE_OPACITY[style],
    depthWrite: false,
    dashSize: style === 'selected' ? 0.2 : 0.16,
    gapSize: style === 'peer' ? 0.17 : 0.12,
    toneMapped: false
  });
  const line = new THREE.LineSegments(geometry, material);
  line.name = `realm-worker-routes-${style}`;
  line.frustumCulled = false;
  line.renderOrder = style === 'selected' ? 5 : style === 'owned' ? 4 : 3;
  line.visible = false;
  return Object.freeze({
    geometry,
    material,
    line,
    positionAttribute,
    lineDistanceAttribute
  });
}

export function createRealmWorkerRouteLayer(
  options: RealmWorkerRouteLayerOptions
): RealmWorkerRouteLayer {
  const group = new THREE.Group();
  group.name = 'realm-worker-route-layer';
  const styles = new Map(STYLE_ORDER.map((style) => [style, createStyleLine(style)] as const));
  for (const style of STYLE_ORDER) group.add(styles.get(style)!.line);

  let workers = [...options.workers];
  let selectedWorkerId: string | null = null;
  let hoveredWorkerId: string | null = null;
  let lastNowMicros = -1n;
  let lastSignature = '';
  let telemetry = emptyTelemetry();
  let disposed = false;

  const rebuild = (nowMicros: bigint) => {
    const candidates: RouteCandidate[] = [];
    let rejectedRouteCount = 0;
    for (const worker of workers) {
      if (!routeIsEligible(worker, selectedWorkerId, hoveredWorkerId)) continue;
      const presentation = routeStyle(worker, selectedWorkerId, hoveredWorkerId);
      const points = resolveRealmWorkerRemainingRouteWorldPoints(
        worker,
        nowMicros,
        options.hexSize,
        worker.status === 'gathering'
      );
      if (!points || points.length < 2) {
        rejectedRouteCount += 1;
        continue;
      }
      candidates.push(Object.freeze({
        worker,
        points,
        directionGlyph: routeDirectionGlyph(points),
        ...presentation
      }));
    }
    candidates.sort((left, right) => (
      left.priority - right.priority
      || left.worker.originCastleId - right.worker.originCastleId
      || left.worker.ordinal - right.worker.ordinal
      || left.worker.workerId.localeCompare(right.worker.workerId)
    ));

    const accepted: RouteCandidate[] = [];
    let segmentCount = 0;
    for (const candidate of candidates) {
      if (accepted.length >= REALM_WORKER_ROUTE_BUDGET.maximumVisibleRoutes) break;
      const candidateSegments = candidate.points.length - 1
        + candidate.directionGlyph.length;
      if (
        candidateSegments <= 0
        || segmentCount + candidateSegments
          > REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments
      ) continue;
      accepted.push(candidate);
      segmentCount += candidateSegments;
    }
    rejectedRouteCount += Math.max(0, candidates.length - accepted.length);

    const signature = [
      selectedWorkerId ?? '',
      hoveredWorkerId ?? '',
      ...accepted.flatMap((candidate) => [
        candidate.worker.workerId,
        candidate.worker.timelineRevision,
        candidate.style,
        ...candidate.points.flatMap((point) => [
          point.x.toFixed(5),
          point.z.toFixed(5)
        ])
      ])
    ].join('|');
    if (signature === lastSignature) return false;
    lastSignature = signature;

    const styleSegmentCounts: Record<RouteStyle, number> = {
      selected: 0,
      owned: 0,
      peer: 0
    };
    const counts: Record<RouteStyle, number> = {
      selected: 0,
      owned: 0,
      peer: 0
    };
    let visibleRouteCount = 0;

    const writeSegment = (
      style: RouteStyle,
      from: HexWorldPosition,
      to: HexWorldPosition
    ) => {
      const fromY = options.heightAtWorld(from);
      const toY = options.heightAtWorld(to);
      if (!Number.isFinite(fromY) || !Number.isFinite(toY)) return false;

      const segmentIndex = styleSegmentCounts[style];
      if (segmentIndex >= REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments) {
        return false;
      }
      const entry = styles.get(style)!;
      const positions = entry.positionAttribute.array as Float32Array;
      const distances = entry.lineDistanceAttribute.array as Float32Array;
      const positionOffset = segmentIndex * 6;
      const distanceOffset = segmentIndex * 2;
      positions[positionOffset] = from.x;
      positions[positionOffset + 1] = fromY + ROUTE_GROUND_LIFT;
      positions[positionOffset + 2] = from.z;
      positions[positionOffset + 3] = to.x;
      positions[positionOffset + 4] = toY + ROUTE_GROUND_LIFT;
      positions[positionOffset + 5] = to.z;
      distances[distanceOffset] = 0;
      distances[distanceOffset + 1] = Math.hypot(
        to.x - from.x,
        to.z - from.z
      );
      styleSegmentCounts[style] += 1;
      return true;
    };

    for (const candidate of accepted) {
      const segmentsBefore = styleSegmentCounts[candidate.style];
      let routeComplete = true;
      for (let index = 0; index < candidate.points.length - 1; index += 1) {
        const from = candidate.points[index]!;
        const to = candidate.points[index + 1]!;
        if (!writeSegment(candidate.style, from, to)) routeComplete = false;
      }
      // A small two-segment chevron makes travel direction explicit without
      // adding another material, draw call, triangle, timer, or moving effect.
      for (const segment of candidate.directionGlyph) {
        if (!writeSegment(candidate.style, segment.from, segment.to)) {
          routeComplete = false;
        }
      }
      if (routeComplete && styleSegmentCounts[candidate.style] > segmentsBefore) {
        counts[candidate.style] += 1;
        visibleRouteCount += 1;
      } else {
        styleSegmentCounts[candidate.style] = segmentsBefore;
        rejectedRouteCount += 1;
      }
    }

    let drawCallCount = 0;
    let visibleSegmentCount = 0;
    for (const style of STYLE_ORDER) {
      const entry = styles.get(style)!;
      const styleSegmentCount = styleSegmentCounts[style];
      const visibleVertexCount = styleSegmentCount * 2;
      entry.geometry.setDrawRange(0, visibleVertexCount);
      entry.positionAttribute.clearUpdateRanges();
      entry.lineDistanceAttribute.clearUpdateRanges();
      if (visibleVertexCount > 0) {
        entry.positionAttribute.addUpdateRange(
          0,
          visibleVertexCount * entry.positionAttribute.itemSize
        );
        entry.lineDistanceAttribute.addUpdateRange(0, visibleVertexCount);
        entry.positionAttribute.needsUpdate = true;
        entry.lineDistanceAttribute.needsUpdate = true;
      }
      entry.line.visible = visibleVertexCount > 0;
      if (entry.line.visible) {
        drawCallCount += 1;
        visibleSegmentCount += styleSegmentCount;
      }
    }
    telemetry = Object.freeze({
      visibleRouteCount,
      visibleSegmentCount,
      selectedRouteCount: counts.selected,
      ownedRouteCount: counts.owned,
      peerRouteCount: counts.peer,
      drawCallCount,
      triangleCount: 0,
      rejectedRouteCount
    });
    return true;
  };

  rebuild(0n);

  const select = (
    nextSelectedWorkerId: string | null,
    nextHoveredWorkerId: string | null
  ) => {
    if (
      selectedWorkerId === nextSelectedWorkerId
      && hoveredWorkerId === nextHoveredWorkerId
    ) return;
    selectedWorkerId = nextSelectedWorkerId !== null
      && workers.some((worker) => worker.workerId === nextSelectedWorkerId)
      ? nextSelectedWorkerId
      : null;
    hoveredWorkerId = nextHoveredWorkerId !== null
      && workers.some((worker) => worker.workerId === nextHoveredWorkerId)
      ? nextHoveredWorkerId
      : null;
    rebuild(lastNowMicros < 0n ? 0n : lastNowMicros);
  };

  return Object.freeze({
    group,
    canReconcile: (next) => !disposed && sameStaticCatalog(workers, next),
    reconcile: (next) => {
      if (disposed || !sameStaticCatalog(workers, next)) return false;
      workers = [...next];
      lastSignature = '';
      rebuild(lastNowMicros < 0n ? 0n : lastNowMicros);
      return true;
    },
    update: (nowMicros) => {
      if (disposed || typeof nowMicros !== 'bigint' || nowMicros < 0n) return false;
      lastNowMicros = nowMicros;
      return rebuild(nowMicros);
    },
    setHoveredWorkerId: (workerId) => select(selectedWorkerId, workerId),
    setSelectedWorkerId: (workerId) => select(workerId, hoveredWorkerId),
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const style of STYLE_ORDER) {
        const entry = styles.get(style)!;
        group.remove(entry.line);
        entry.geometry.dispose();
        entry.material.dispose();
      }
      styles.clear();
    }
  });
}
