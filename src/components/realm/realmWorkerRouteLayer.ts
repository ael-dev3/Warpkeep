import * as THREE from 'three';

import type { HexWorldPosition } from '../../game/map/hexCoordinates';
import {
  resolveRealmWorkerRoutePose,
  resolveRealmWorkerVisualRoute,
  type RealmWorkerSceneRecord,
  type RealmWorkerVisualRoute
} from './realmWorkerRoutePresentation';

export const REALM_WORKER_ROUTE_BUDGET = Object.freeze({
  maximumVisibleRoutes: 24,
  maximumVisibleSegments: 512,
  maximumDrawCalls: 3,
  maximumTriangles: 1_024
});

export type RealmWorkerRouteLayerTelemetry = Readonly<{
  visibleRouteCount: number;
  visibleSegmentCount: number;
  visibleVertexCount: number;
  selectedRouteCount: number;
  ownedRouteCount: number;
  peerRouteCount: number;
  exactMatchRouteCount: number;
  normalizedTimeRouteCount: number;
  genuineInvalidRouteCount: number;
  hiddenByBudgetCount: number;
  smoothingFallbackCount: number;
  corridorValidationFailureCount: number;
  drawCallCount: number;
  triangleCount: number;
  completedLength: number;
  remainingLength: number;
  topologyRebuildCount: number;
  progressUpdateCount: number;
  /** Compatibility aggregate: invalid, terrain-rejected, and budget-hidden. */
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
  reducedMotion?: boolean;
}>;

type RouteStyle = 'selected' | 'owned' | 'peer';

type RouteCandidate = Readonly<{
  worker: RealmWorkerSceneRecord;
  visualRoute: RealmWorkerVisualRoute;
  pointHeights: readonly number[];
  style: RouteStyle;
  priority: number;
}>;

type AcceptedRoute = RouteCandidate & Readonly<{
  routeSlot: number;
  segmentCount: number;
}>;

type StyleRibbon = Readonly<{
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  positionAttribute: THREE.BufferAttribute;
  routeSlotAttribute: THREE.BufferAttribute;
  routeProgressAttribute: THREE.BufferAttribute;
  routeLateralAttribute: THREE.BufferAttribute;
  routeStates: readonly THREE.Vector4[];
}>;

const STYLE_ORDER = Object.freeze(['selected', 'owned', 'peer'] as const);
const STYLE_COLOR: Readonly<Record<RouteStyle, THREE.ColorRepresentation>> =
  Object.freeze({
    selected: '#fff0a8',
    owned: '#dab45b',
    peer: '#77708d'
  });
const STYLE_OPACITY: Readonly<Record<RouteStyle, number>> = Object.freeze({
  selected: 0.94,
  owned: 0.7,
  peer: 0.38
});
const STYLE_HALF_WIDTH: Readonly<Record<RouteStyle, number>> = Object.freeze({
  selected: 0.074,
  owned: 0.062,
  peer: 0.052
});
const ROUTE_GROUND_LIFT = 0.055;
const VERTICES_PER_SEGMENT = 4;
const INDICES_PER_SEGMENT = 6;
const ROUTE_VERTEX_CAPACITY =
  REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * VERTICES_PER_SEGMENT;
const ROUTE_INDEX_CAPACITY =
  REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * INDICES_PER_SEGMENT;
const ROUTE_STATE_CAPACITY =
  REALM_WORKER_ROUTE_BUDGET.maximumVisibleRoutes;

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

function routePresentation(
  worker: RealmWorkerSceneRecord,
  selectedWorkerId: string | null,
  hoveredWorkerId: string | null
): Readonly<{ style: RouteStyle; priority: number }> | undefined {
  if (worker.workerId === selectedWorkerId) {
    return Object.freeze({ style: 'selected', priority: 0 });
  }
  if (worker.ownedByViewer) {
    return Object.freeze({ style: 'owned', priority: 1 });
  }
  if (worker.workerId === hoveredWorkerId) {
    return Object.freeze({ style: 'peer', priority: 2 });
  }
  // Peer travel remains legible through its wagon and PFP marker. Its route
  // appears only on deliberate hover/selection to avoid a realm-wide web.
  return undefined;
}

function routeIsEligible(
  worker: RealmWorkerSceneRecord,
  selectedWorkerId: string | null,
  hoveredWorkerId: string | null
) {
  if (worker.status === 'idle') return false;
  if (worker.status === 'gathering') {
    return worker.workerId === selectedWorkerId
      || worker.workerId === hoveredWorkerId;
  }
  return worker.ownedByViewer
    || worker.workerId === selectedWorkerId
    || worker.workerId === hoveredWorkerId;
}

function emptyTelemetry(
  topologyRebuildCount = 0,
  progressUpdateCount = 0
): RealmWorkerRouteLayerTelemetry {
  return Object.freeze({
    visibleRouteCount: 0,
    visibleSegmentCount: 0,
    visibleVertexCount: 0,
    selectedRouteCount: 0,
    ownedRouteCount: 0,
    peerRouteCount: 0,
    exactMatchRouteCount: 0,
    normalizedTimeRouteCount: 0,
    genuineInvalidRouteCount: 0,
    hiddenByBudgetCount: 0,
    smoothingFallbackCount: 0,
    corridorValidationFailureCount: 0,
    drawCallCount: 0,
    triangleCount: 0,
    completedLength: 0,
    remainingLength: 0,
    topologyRebuildCount,
    progressUpdateCount,
    rejectedRouteCount: 0
  });
}

const ROUTE_VERTEX_SHADER = `
  uniform vec4 uRouteState[${ROUTE_STATE_CAPACITY}];
  attribute float routeSlot;
  attribute float routeProgress;
  attribute float routeLateral;
  varying float vRouteProgress;
  varying float vRouteLateral;
  varying vec4 vRouteState;
  #include <fog_pars_vertex>

  vec4 readRouteState(float slot) {
    vec4 state = vec4(0.0);
    for (int index = 0; index < ${ROUTE_STATE_CAPACITY}; index += 1) {
      if (abs(slot - float(index)) < 0.25) {
        state = uRouteState[index];
      }
    }
    return state;
  }

  void main() {
    vRouteProgress = routeProgress;
    vRouteLateral = routeLateral;
    vRouteState = readRouteState(routeSlot);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const ROUTE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uMotionPhase;
  uniform float uReducedMotion;
  varying float vRouteProgress;
  varying float vRouteLateral;
  varying vec4 vRouteState;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    float forwardProgress = clamp(vRouteState.x, 0.0, 1.0);
    float direction = vRouteState.y;
    if (vRouteState.z < 0.5) discard;
    if (direction < -0.5 && vRouteProgress > forwardProgress + 0.002) {
      discard;
    }

    float completed = direction > 0.5
      ? 1.0 - smoothstep(
          forwardProgress - 0.018,
          forwardProgress + 0.018,
          vRouteProgress
        )
      : direction < -0.5
        ? smoothstep(
            forwardProgress - 0.018,
            forwardProgress + 0.018,
            vRouteProgress
          )
        : 0.0;
    float travelDirection = direction < -0.5 ? -1.0 : 1.0;
    float movingPhase = mix(
      0.0,
      uMotionPhase * travelDirection,
      1.0 - uReducedMotion
    );
    float directionalPhase = fract(
      vRouteProgress * 16.0 * travelDirection - movingPhase
    );
    float chevronCenter = 0.72 - abs(vRouteLateral) * 0.24;
    float chevron = 1.0 - smoothstep(
      0.055,
      0.19,
      abs(directionalPhase - chevronCenter)
    );
    float dash = mix(0.34, 1.0, chevron);
    float contactEdge = smoothstep(0.66, 0.98, abs(vRouteLateral));
    float centerLight = 1.0 - smoothstep(0.0, 0.72, abs(vRouteLateral));
    float brightness = mix(0.46, 1.0, dash) * mix(1.0, 0.44, completed);
    vec3 color = uColor * brightness;
    color = mix(color * 0.32, color, 1.0 - contactEdge * 0.72);
    color += uColor * centerLight * 0.08;
    float alpha = uOpacity * mix(0.68, 1.0, dash);
    alpha *= 1.0 - contactEdge * 0.18;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function createStyleRibbon(style: RouteStyle): StyleRibbon {
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(
    new Float32Array(ROUTE_VERTEX_CAPACITY * 3),
    3
  );
  const routeSlotAttribute = new THREE.BufferAttribute(
    new Float32Array(ROUTE_VERTEX_CAPACITY),
    1
  );
  const routeProgressAttribute = new THREE.BufferAttribute(
    new Float32Array(ROUTE_VERTEX_CAPACITY),
    1
  );
  const routeLateralAttribute = new THREE.BufferAttribute(
    new Float32Array(ROUTE_VERTEX_CAPACITY),
    1
  );
  for (const attribute of [
    positionAttribute,
    routeSlotAttribute,
    routeProgressAttribute,
    routeLateralAttribute
  ]) {
    attribute.setUsage(THREE.DynamicDrawUsage);
  }
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('routeSlot', routeSlotAttribute);
  geometry.setAttribute('routeProgress', routeProgressAttribute);
  geometry.setAttribute('routeLateral', routeLateralAttribute);
  const indices = new Uint16Array(ROUTE_INDEX_CAPACITY);
  for (
    let segmentIndex = 0;
    segmentIndex < REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments;
    segmentIndex += 1
  ) {
    const vertex = segmentIndex * VERTICES_PER_SEGMENT;
    const offset = segmentIndex * INDICES_PER_SEGMENT;
    indices[offset] = vertex;
    indices[offset + 1] = vertex + 2;
    indices[offset + 2] = vertex + 1;
    indices[offset + 3] = vertex + 2;
    indices[offset + 4] = vertex + 3;
    indices[offset + 5] = vertex + 1;
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const routeStates = Object.freeze(
    Array.from({ length: ROUTE_STATE_CAPACITY }, () => new THREE.Vector4())
  );
  const fogUniforms = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...fogUniforms,
      uColor: { value: new THREE.Color(STYLE_COLOR[style]) },
      uOpacity: { value: STYLE_OPACITY[style] },
      uMotionPhase: { value: 0 },
      uReducedMotion: { value: 0 },
      uRouteState: { value: routeStates }
    },
    vertexShader: ROUTE_VERTEX_SHADER,
    fragmentShader: ROUTE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `realm-worker-routes-${style}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = style === 'selected' ? 5 : style === 'owned' ? 4 : 3;
  mesh.visible = false;
  return Object.freeze({
    geometry,
    material,
    mesh,
    positionAttribute,
    routeSlotAttribute,
    routeProgressAttribute,
    routeLateralAttribute,
    routeStates
  });
}

function writeRibbonSegment(
  entry: StyleRibbon,
  segmentIndex: number,
  routeSlot: number,
  from: HexWorldPosition,
  to: HexWorldPosition,
  fromY: number,
  toY: number,
  fromProgress: number,
  toProgress: number,
  halfWidth: number
) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.000_001) return false;
  const perpendicularX = -dz / length * halfWidth;
  const perpendicularZ = dx / length * halfWidth;
  const positionArray = entry.positionAttribute.array as Float32Array;
  const slotArray = entry.routeSlotAttribute.array as Float32Array;
  const progressArray = entry.routeProgressAttribute.array as Float32Array;
  const lateralArray = entry.routeLateralAttribute.array as Float32Array;
  const vertexOffset = segmentIndex * VERTICES_PER_SEGMENT;
  const points = [
    [from.x + perpendicularX, fromY, from.z + perpendicularZ],
    [from.x - perpendicularX, fromY, from.z - perpendicularZ],
    [to.x + perpendicularX, toY, to.z + perpendicularZ],
    [to.x - perpendicularX, toY, to.z - perpendicularZ]
  ] as const;
  for (let vertex = 0; vertex < VERTICES_PER_SEGMENT; vertex += 1) {
    const positionOffset = (vertexOffset + vertex) * 3;
    const point = points[vertex]!;
    positionArray[positionOffset] = point[0];
    positionArray[positionOffset + 1] = point[1] + ROUTE_GROUND_LIFT;
    positionArray[positionOffset + 2] = point[2];
    slotArray[vertexOffset + vertex] = routeSlot;
    progressArray[vertexOffset + vertex] = vertex < 2
      ? fromProgress
      : toProgress;
    lateralArray[vertexOffset + vertex] = vertex % 2 === 0 ? -1 : 1;
  }
  return true;
}

function phaseDirection(status: RealmWorkerSceneRecord['status']) {
  if (status === 'outbound') return 1;
  if (status === 'returning') return -1;
  return 0;
}

export function createRealmWorkerRouteLayer(
  options: RealmWorkerRouteLayerOptions
): RealmWorkerRouteLayer {
  const group = new THREE.Group();
  group.name = 'realm-worker-route-layer';
  const styles = new Map(
    STYLE_ORDER.map((style) => [style, createStyleRibbon(style)] as const)
  );
  for (const style of STYLE_ORDER) group.add(styles.get(style)!.mesh);

  let workers = [...options.workers];
  let acceptedRoutes: readonly AcceptedRoute[] = Object.freeze([]);
  let selectedWorkerId: string | null = null;
  let hoveredWorkerId: string | null = null;
  let lastNowMicros = 0n;
  let lastTopologySignature = '';
  let lastMotionPhase = Number.NaN;
  let topologyRebuildCount = 0;
  let progressUpdateCount = 0;
  let genuineInvalidRouteCount = 0;
  let terrainRejectedRouteCount = 0;
  let hiddenByBudgetCount = 0;
  let telemetry = emptyTelemetry();
  let disposed = false;

  const updateRouteStates = (nowMicros: bigint) => {
    const visibleRouteCountByStyle: Record<RouteStyle, number> = {
      selected: 0,
      owned: 0,
      peer: 0
    };
    const visibleSegmentsByStyle: Record<RouteStyle, number> = {
      selected: 0,
      owned: 0,
      peer: 0
    };
    let completedLength = 0;
    let remainingLength = 0;
    let hasAnimatedRoute = false;
    let exactMatchRouteCount = 0;
    let normalizedTimeRouteCount = 0;
    let smoothingFallbackCount = 0;
    let corridorValidationFailureCount = 0;
    let routeStateChanged = false;

    for (const candidate of acceptedRoutes) {
      const pose = resolveRealmWorkerRoutePose(
        candidate.worker,
        nowMicros,
        options.hexSize
      );
      const phaseComplete = pose
        && (pose.direction === 'outbound' || pose.direction === 'returning')
        && pose.phaseProgress >= 1;
      const ribbonStartProgress =
        candidate.visualRoute.ribbonProgress[0] ?? 0;
      const hasRemainingRibbon = pose?.direction !== 'returning'
        || (pose.forwardProgress > ribbonStartProgress + 0.000_001);
      const visible = pose !== undefined
        && !phaseComplete
        && hasRemainingRibbon;
      const entry = styles.get(candidate.style)!;
      const state = entry.routeStates[candidate.routeSlot]!;
      const progress = pose?.forwardProgress ?? 0;
      const direction = phaseDirection(candidate.worker.status);
      const visibility = visible ? 1 : 0;
      if (
        state.x !== progress
        || state.y !== direction
        || state.z !== visibility
      ) routeStateChanged = true;
      state.set(
        progress,
        direction,
        visibility,
        0
      );
      if (!visible) continue;
      if (
        candidate.worker.status === 'outbound'
        || candidate.worker.status === 'returning'
      ) {
        hasAnimatedRoute = true;
      }
      visibleRouteCountByStyle[candidate.style] += 1;
      visibleSegmentsByStyle[candidate.style] += candidate.segmentCount;
      if (candidate.visualRoute.contract === 'exact-match') {
        exactMatchRouteCount += 1;
      } else {
        normalizedTimeRouteCount += 1;
      }
      if (candidate.visualRoute.smoothingFallback) {
        smoothingFallbackCount += 1;
      }
      corridorValidationFailureCount +=
        candidate.visualRoute.corridorValidationFailureCount;
      const length = candidate.visualRoute.totalLength;
      if (candidate.worker.status === 'returning') {
        completedLength += length * (1 - progress);
        remainingLength += length * progress;
      } else if (candidate.worker.status === 'gathering') {
        completedLength += length;
      } else {
        completedLength += length * progress;
        remainingLength += length * (1 - progress);
      }
    }

    const motionPhase = options.reducedMotion || !hasAnimatedRoute
      ? 0
      : Number(nowMicros % 2_000_000n) / 2_000_000;
    if (!routeStateChanged && motionPhase === lastMotionPhase) return false;
    lastMotionPhase = motionPhase;
    progressUpdateCount += 1;

    let drawCallCount = 0;
    let visibleSegmentCount = 0;
    for (const style of STYLE_ORDER) {
      const entry = styles.get(style)!;
      entry.material.uniforms.uMotionPhase!.value = motionPhase;
      entry.material.uniforms.uReducedMotion!.value =
        options.reducedMotion ? 1 : 0;
      entry.material.uniformsNeedUpdate = true;
      entry.mesh.visible = visibleRouteCountByStyle[style] > 0;
      if (entry.mesh.visible) {
        drawCallCount += 1;
        visibleSegmentCount += visibleSegmentsByStyle[style];
      }
    }
    const visibleRouteCount = visibleRouteCountByStyle.selected
      + visibleRouteCountByStyle.owned
      + visibleRouteCountByStyle.peer;
    telemetry = Object.freeze({
      visibleRouteCount,
      visibleSegmentCount,
      visibleVertexCount: visibleSegmentCount * VERTICES_PER_SEGMENT,
      selectedRouteCount: visibleRouteCountByStyle.selected,
      ownedRouteCount: visibleRouteCountByStyle.owned,
      peerRouteCount: visibleRouteCountByStyle.peer,
      exactMatchRouteCount,
      normalizedTimeRouteCount,
      genuineInvalidRouteCount,
      hiddenByBudgetCount,
      smoothingFallbackCount,
      corridorValidationFailureCount,
      drawCallCount,
      triangleCount: visibleSegmentCount * 2,
      completedLength,
      remainingLength,
      topologyRebuildCount,
      progressUpdateCount,
      rejectedRouteCount: genuineInvalidRouteCount
        + terrainRejectedRouteCount
        + hiddenByBudgetCount
    });
    return true;
  };

  const rebuildTopology = (nowMicros: bigint) => {
    const candidates: RouteCandidate[] = [];
    genuineInvalidRouteCount = 0;
    terrainRejectedRouteCount = 0;
    hiddenByBudgetCount = 0;

    for (const worker of workers) {
      if (!routeIsEligible(worker, selectedWorkerId, hoveredWorkerId)) continue;
      const presentation = routePresentation(
        worker,
        selectedWorkerId,
        hoveredWorkerId
      );
      if (!presentation) continue;
      const visualRoute = resolveRealmWorkerVisualRoute(worker, options.hexSize);
      if (!visualRoute || visualRoute.ribbonPoints.length < 2) {
        genuineInvalidRouteCount += 1;
        continue;
      }
      const pointHeights = visualRoute.ribbonPoints.map((point) => (
        options.heightAtWorld(point)
      ));
      if (pointHeights.some((height) => !Number.isFinite(height))) {
        terrainRejectedRouteCount += 1;
        continue;
      }
      candidates.push(Object.freeze({
        worker,
        visualRoute,
        pointHeights: Object.freeze(pointHeights),
        ...presentation
      }));
    }
    candidates.sort((left, right) => (
      left.priority - right.priority
      || left.worker.originCastleId - right.worker.originCastleId
      || left.worker.ordinal - right.worker.ordinal
      || left.worker.workerId.localeCompare(right.worker.workerId)
    ));

    const accepted: AcceptedRoute[] = [];
    const routeSlots: Record<RouteStyle, number> = {
      selected: 0,
      owned: 0,
      peer: 0
    };
    let segmentCount = 0;
    for (const candidate of candidates) {
      const candidateSegments = candidate.visualRoute.ribbonPoints.length - 1;
      if (
        accepted.length >= REALM_WORKER_ROUTE_BUDGET.maximumVisibleRoutes
        || candidateSegments <= 0
        || segmentCount + candidateSegments
          > REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments
      ) {
        hiddenByBudgetCount += 1;
        continue;
      }
      const routeSlot = routeSlots[candidate.style];
      if (routeSlot >= ROUTE_STATE_CAPACITY) {
        hiddenByBudgetCount += 1;
        continue;
      }
      routeSlots[candidate.style] += 1;
      accepted.push(Object.freeze({
        ...candidate,
        routeSlot,
        segmentCount: candidateSegments
      }));
      segmentCount += candidateSegments;
    }

    const signature = [
      selectedWorkerId ?? '',
      hoveredWorkerId ?? '',
      ...accepted.flatMap((candidate) => [
        candidate.worker.workerId,
        candidate.style,
        candidate.worker.status,
        candidate.visualRoute.contract,
        ...candidate.visualRoute.ribbonPoints.flatMap((point, index) => [
          point.x.toFixed(5),
          candidate.pointHeights[index]!.toFixed(5),
          point.z.toFixed(5),
          candidate.visualRoute.ribbonProgress[index]!.toFixed(6)
        ])
      ])
    ].join('|');
    if (signature === lastTopologySignature) {
      acceptedRoutes = Object.freeze(accepted);
      lastMotionPhase = Number.NaN;
      return updateRouteStates(nowMicros);
    }
    lastTopologySignature = signature;
    acceptedRoutes = Object.freeze(accepted);
    topologyRebuildCount += 1;

    const styleSegmentCounts: Record<RouteStyle, number> = {
      selected: 0,
      owned: 0,
      peer: 0
    };
    for (const candidate of acceptedRoutes) {
      const entry = styles.get(candidate.style)!;
      const points = candidate.visualRoute.ribbonPoints;
      const progress = candidate.visualRoute.ribbonProgress;
      const heights = candidate.pointHeights;
      for (let index = 0; index < points.length - 1; index += 1) {
        const segmentIndex = styleSegmentCounts[candidate.style];
        if (!writeRibbonSegment(
          entry,
          segmentIndex,
          candidate.routeSlot,
          points[index]!,
          points[index + 1]!,
          heights[index]!,
          heights[index + 1]!,
          progress[index]!,
          progress[index + 1]!,
          STYLE_HALF_WIDTH[candidate.style] * options.hexSize
        )) continue;
        styleSegmentCounts[candidate.style] += 1;
      }
    }

    for (const style of STYLE_ORDER) {
      const entry = styles.get(style)!;
      const styleSegmentCount = styleSegmentCounts[style];
      const vertexCount = styleSegmentCount * VERTICES_PER_SEGMENT;
      entry.geometry.setDrawRange(
        0,
        styleSegmentCount * INDICES_PER_SEGMENT
      );
      for (const attribute of [
        entry.positionAttribute,
        entry.routeSlotAttribute,
        entry.routeProgressAttribute,
        entry.routeLateralAttribute
      ]) {
        attribute.clearUpdateRanges();
        if (vertexCount > 0) {
          attribute.addUpdateRange(0, vertexCount * attribute.itemSize);
          attribute.needsUpdate = true;
        }
      }
      entry.geometry.computeBoundingSphere();
    }
    lastMotionPhase = Number.NaN;
    return updateRouteStates(nowMicros);
  };

  rebuildTopology(0n);

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
    rebuildTopology(lastNowMicros);
  };

  return Object.freeze({
    group,
    canReconcile: (next) => !disposed && sameStaticCatalog(workers, next),
    reconcile: (next) => {
      if (disposed || !sameStaticCatalog(workers, next)) return false;
      workers = [...next];
      rebuildTopology(lastNowMicros);
      return true;
    },
    update: (nowMicros) => {
      if (disposed || typeof nowMicros !== 'bigint' || nowMicros < 0n) return false;
      lastNowMicros = nowMicros;
      return updateRouteStates(nowMicros);
    },
    setHoveredWorkerId: (workerId) => select(selectedWorkerId, workerId),
    setSelectedWorkerId: (workerId) => select(workerId, hoveredWorkerId),
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const style of STYLE_ORDER) {
        const entry = styles.get(style)!;
        group.remove(entry.mesh);
        entry.geometry.dispose();
        entry.material.dispose();
      }
      acceptedRoutes = Object.freeze([]);
      styles.clear();
    }
  });
}
