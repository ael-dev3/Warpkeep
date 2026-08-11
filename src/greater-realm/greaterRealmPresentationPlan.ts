import { POINTY_TOP_AXIAL_DIRECTIONS, axialToWorld } from '../game/map/hexCoordinates';
import {
  GREATER_REALM_AMBIENCE_CLASS,
  GREATER_REALM_HYDRO_REGIME,
  GREATER_REALM_TRAVEL_CLASS,
  greaterRealmCoordinateKey,
  type GreaterRealmChunkDto,
  type GreaterRealmPublicCellDto,
  type GreaterRealmResourceKind
} from './greaterRealmPublicContract';
import {
  GREATER_REALM_GRAPHICS_BUDGETS,
  greaterRealmLodAllowsActors,
  greaterRealmLodAllowsCanopy,
  greaterRealmLodAllowsGroundcover,
  type GreaterRealmGraphicsProfile
} from './greaterRealmRuntimePolicy';

export type GreaterRealmPresentationPosition = Readonly<{ x: number; y: number; z: number }>;

export type GreaterRealmPresentationActor = Readonly<{
  id: string;
  kind: 'canopy' | 'grass' | 'flower' | 'npc' | 'wildlife' | 'boat';
  position: GreaterRealmPresentationPosition;
  headingRadians: number;
  phase: number;
  bladeCount: number;
  triangleCount: number;
  geometryBytes: number;
}>;

export type GreaterRealmPresentationSegment = Readonly<{
  from: GreaterRealmPresentationPosition;
  to: GreaterRealmPresentationPosition;
  kind: 'track' | 'road' | 'carriageway' | 'river' | 'stream' | 'boat-lane';
}>;

export type GreaterRealmCrossingPresentation = Readonly<{
  position: GreaterRealmPresentationPosition;
  headingRadians: number;
  kind: 'ford' | 'bridge';
}>;

export type GreaterRealmSealedEdgePresentation = Readonly<{
  from: GreaterRealmPresentationPosition;
  to: GreaterRealmPresentationPosition;
}>;

export type GreaterRealmCellAccessPresentation = Readonly<{
  cellKey: string;
  coordinateKey: string;
  passable: boolean;
}>;

export type GreaterRealmResourcePresentation = Readonly<{
  id: string;
  kind: GreaterRealmResourceKind;
  nodeCount: number;
  position: GreaterRealmPresentationPosition;
}>;

export type GreaterRealmChunkPresentationPlan = Readonly<{
  chunkHandle: string;
  revision: bigint;
  lod: GreaterRealmChunkDto['lod'];
  cellSize: number;
  terrainCells: readonly GreaterRealmPublicCellDto[];
  apronCoordinateKeys: readonly string[];
  waterCells: readonly GreaterRealmPublicCellDto[];
  routeSegments: readonly GreaterRealmPresentationSegment[];
  crossings: readonly GreaterRealmCrossingPresentation[];
  sealedEdges: readonly GreaterRealmSealedEdgePresentation[];
  actors: readonly GreaterRealmPresentationActor[];
  resources: readonly GreaterRealmResourcePresentation[];
  cellAccess: readonly GreaterRealmCellAccessPresentation[];
  blockedCoordinateKeys: readonly string[];
  drawCallCount: number;
  instanceCount: number;
  grassPatchCount: number;
  grassBladeCount: number;
  grassTriangleCount: number;
  grassDrawCallCount: number;
  flowerCount: number;
  flowerDrawCallCount: number;
  flowerGeometryBytes: number;
  estimatedUploadBytes: number;
}>;

export type GreaterRealmActorAllowance = Readonly<{
  canopy: number;
  grassPatches: number;
  grassBlades: number;
  grassTriangles: number;
  flowers: number;
  flowerGeometryBytes: number;
  npc: number;
  wildlife: number;
  boat: number;
  grassLayer: boolean;
  flowerLayer: boolean;
}>;

/**
 * Actual BufferGeometry byte sizes for the fixed Three.js primitives used by
 * the scene runtime, including positions, normals, UVs, and indices. Dynamic
 * instance matrices/colors are accounted separately below.
 */
const STATIC_GEOMETRY_BYTES = Object.freeze({
  crossing: 840,
  canopy: 796,
  grass: 516,
  flower: 656,
  npc: 1_208,
  wildlife: 840,
  boat: 840,
  resource: 768
});

const POINTY_TOP_SIDE_CORNER_INDICES = Object.freeze([
  Object.freeze([1, 2] as const),
  Object.freeze([0, 1] as const),
  Object.freeze([5, 0] as const),
  Object.freeze([4, 5] as const),
  Object.freeze([3, 4] as const),
  Object.freeze([2, 3] as const)
]);

function stableUnit(cell: GreaterRealmPublicCellDto, channel: number) {
  let value = cell.presentationVariant ^ Math.imul(channel + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 0x1_0000_0000;
}

function cellPosition(cell: GreaterRealmPublicCellDto, cellSize: number, lift = 0) {
  const world = axialToWorld({ q: cell.atlasQ, r: cell.atlasR }, cellSize);
  return Object.freeze({ x: world.x, y: cell.elevation / 1_000 + lift, z: world.z });
}

function coordinatePosition(
  atlasQ: number,
  atlasR: number,
  cellSize: number,
  elevation = 0,
  lift = 0
) {
  const world = axialToWorld({ q: atlasQ, r: atlasR }, cellSize);
  return Object.freeze({ x: world.x, y: elevation / 1_000 + lift, z: world.z });
}

function directionPosition(
  cell: GreaterRealmPublicCellDto,
  direction: number,
  cellSize: number,
  lift = 0
) {
  const delta = POINTY_TOP_AXIAL_DIRECTIONS[direction]!;
  return coordinatePosition(
    cell.atlasQ + delta.q,
    cell.atlasR + delta.r,
    cellSize,
    cell.elevation,
    lift
  );
}

function heading(from: GreaterRealmPresentationPosition, to: GreaterRealmPresentationPosition) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function allowance(
  profile: GreaterRealmGraphicsProfile,
  input?: Partial<GreaterRealmActorAllowance>
): GreaterRealmActorAllowance {
  const budget = GREATER_REALM_GRAPHICS_BUDGETS[profile];
  const bounded = (value: number | undefined, maximum: number) => Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, Math.trunc(value!)))
    : maximum;
  return Object.freeze({
    canopy: bounded(input?.canopy, budget.canopyCount),
    grassPatches: bounded(input?.grassPatches, budget.grassPatchCount),
    grassBlades: bounded(input?.grassBlades, budget.grassBladeCount),
    grassTriangles: bounded(input?.grassTriangles, budget.grassTriangleCount),
    flowers: bounded(input?.flowers, budget.flowerCount),
    flowerGeometryBytes: bounded(input?.flowerGeometryBytes, budget.flowerGeometryBytes),
    npc: bounded(input?.npc, budget.npcCount),
    wildlife: bounded(input?.wildlife, budget.wildlifeCount),
    boat: bounded(input?.boat, budget.boatCount),
    grassLayer: input?.grassLayer ?? true,
    flowerLayer: input?.flowerLayer ?? true
  });
}

function grassBladesForCell(
  cell: GreaterRealmPublicCellDto,
  profile: GreaterRealmGraphicsProfile
) {
  const maximum = profile === 'high' ? 9 : profile === 'balanced' ? 7 : 5;
  return Math.max(1, Math.min(maximum, Math.ceil(cell.groundcoverBasisPoints / 1_250)));
}

function addActor(
  output: GreaterRealmPresentationActor[],
  cell: GreaterRealmPublicCellDto,
  kind: GreaterRealmPresentationActor['kind'],
  cellSize: number,
  ordinal: number,
  bladeCount = 0,
  triangleCount = 0,
  geometryBytes = 0,
  direction = cell.aspect % 6
) {
  const center = cellPosition(cell, cellSize);
  const phase = stableUnit(cell, ordinal * 7 + kind.length);
  const angle = stableUnit(cell, ordinal * 11 + kind.charCodeAt(0)) * Math.PI * 2;
  const radius = kind === 'boat' ? 0 : cellSize * 0.34 * stableUnit(cell, ordinal + 31);
  output.push(Object.freeze({
    id: `${cell.cellKey}/${kind}/${ordinal}`,
    kind,
    position: Object.freeze({
      x: center.x + Math.sin(angle) * radius,
      y: center.y + (kind === 'boat' ? 0.035 : 0),
      z: center.z + Math.cos(angle) * radius
    }),
    headingRadians: heading(center, directionPosition(cell, direction, cellSize)),
    phase,
    bladeCount,
    triangleCount,
    geometryBytes
  }));
}

function visualTravelKind(travelClass: GreaterRealmPublicCellDto['travelClass']) {
  if (travelClass === GREATER_REALM_TRAVEL_CLASS.CARRIAGEWAY) return 'carriageway' as const;
  if (travelClass === GREATER_REALM_TRAVEL_CLASS.TRACK) return 'track' as const;
  return 'road' as const;
}

/** Visual-only adjacency: this output is never consulted for movement. */
function presentationSegments(
  cells: readonly GreaterRealmPublicCellDto[],
  cellSize: number
) {
  const output: GreaterRealmPresentationSegment[] = [];
  const crossings: GreaterRealmCrossingPresentation[] = [];
  const byCoordinate = new Map(cells.map((cell) => [greaterRealmCoordinateKey(cell), cell]));
  for (const cell of cells) {
    const from = cellPosition(cell, cellSize, 0.05);
    if (cell.travelClass !== GREATER_REALM_TRAVEL_CLASS.NONE) {
      for (let direction = 0; direction < POINTY_TOP_AXIAL_DIRECTIONS.length; direction += 1) {
        const delta = POINTY_TOP_AXIAL_DIRECTIONS[direction]!;
        const neighbor = byCoordinate.get(`${cell.atlasQ + delta.q},${cell.atlasR + delta.r}`);
        if (
          !neighbor
          || neighbor.travelClass === GREATER_REALM_TRAVEL_CLASS.NONE
          || cell.cellKey.localeCompare(neighbor.cellKey) >= 0
        ) continue;
        const strongest = Math.max(
          cell.travelClass,
          neighbor.travelClass
        ) as GreaterRealmPublicCellDto['travelClass'];
        output.push(Object.freeze({
          from,
          to: cellPosition(neighbor, cellSize, 0.05),
          kind: visualTravelKind(strongest)
        }));
      }
    }
    if (
      (cell.hydroRegime === GREATER_REALM_HYDRO_REGIME.RIVER
        || cell.hydroRegime === GREATER_REALM_HYDRO_REGIME.STREAM)
      && cell.hydroFlowDirection !== undefined
    ) {
      const to = directionPosition(cell, cell.hydroFlowDirection, cellSize, 0.035);
      output.push(Object.freeze({
        from,
        to,
        kind: cell.hydroRegime === GREATER_REALM_HYDRO_REGIME.RIVER ? 'river' : 'stream'
      }));
      if (cell.hydroDepthClass >= 2) {
        output.push(Object.freeze({ from, to, kind: 'boat-lane' }));
      }
    }
    if (cell.travelClass === GREATER_REALM_TRAVEL_CLASS.FORD) {
      const crossingDirection = ((cell.hydroFlowDirection ?? cell.aspect) + 2) % 6;
      crossings.push(Object.freeze({
        position: cellPosition(cell, cellSize, 0.07),
        headingRadians: heading(from, directionPosition(cell, crossingDirection, cellSize)),
        kind: cell.hydroDepthClass >= 2 || cell.flowAccumulation >= 1_024n
          ? 'bridge'
          : 'ford'
      }));
    }
  }
  return Object.freeze({
    segments: Object.freeze(output),
    crossings: Object.freeze(crossings)
  });
}

function sealedEdges(cells: readonly GreaterRealmPublicCellDto[], cellSize: number) {
  const output: GreaterRealmSealedEdgePresentation[] = [];
  for (const cell of cells) {
    if (cell.sealedBoundaryMask === 0) continue;
    const center = cellPosition(cell, cellSize);
    for (let direction = 0; direction < 6; direction += 1) {
      if ((cell.sealedBoundaryMask & (1 << direction)) === 0) continue;
      const corners = POINTY_TOP_SIDE_CORNER_INDICES[direction]!;
      const point = (corner: number) => {
        const angle = -Math.PI / 2 + Math.PI * 2 * corner / 6;
        return Object.freeze({
          x: center.x + Math.cos(angle) * cellSize,
          y: center.y,
          z: center.z + Math.sin(angle) * cellSize
        });
      };
      output.push(Object.freeze({
        from: point(corners[0]),
        to: point(corners[1])
      }));
    }
  }
  return Object.freeze(output);
}

/**
 * Every primitive comes from explicit returned core/apron fields. Missing
 * cells are never synthesized; passability is copied only as an inspection
 * value and is never derived from roads, water, or adjacency.
 */
export function createGreaterRealmChunkPresentationPlan(input: Readonly<{
  chunk: GreaterRealmChunkDto;
  graphicsProfile: GreaterRealmGraphicsProfile;
  cellSize: number;
  actorAllowance?: Partial<GreaterRealmActorAllowance>;
}>): GreaterRealmChunkPresentationPlan {
  const cellSize = Number.isFinite(input.cellSize) && input.cellSize > 0
    ? input.cellSize
    : 1;
  const cells = Object.freeze([...input.chunk.coreCells, ...input.chunk.apronCells]);
  const apronCoordinateKeys = Object.freeze(
    input.chunk.apronCells.map(greaterRealmCoordinateKey)
  );
  const waterCells = Object.freeze(cells.filter((cell) => (
    cell.hydroRegime !== GREATER_REALM_HYDRO_REGIME.DRY
  )));
  const routes = presentationSegments(cells, cellSize);
  const boundaries = sealedEdges(cells, cellSize);
  const limits = allowance(input.graphicsProfile, input.actorAllowance);
  const actors: GreaterRealmPresentationActor[] = [];
  let canopyCount = 0;
  let grassPatchCount = 0;
  let grassBladeCount = 0;
  let grassTriangleCount = 0;
  let flowerCount = 0;
  let flowerGeometryBytes = 0;
  let npcCount = 0;
  let wildlifeCount = 0;
  let boatCount = 0;
  for (const cell of cells) {
    if (
      greaterRealmLodAllowsCanopy(input.chunk.lod)
      && cell.canopyBasisPoints > 0
      && canopyCount < limits.canopy
    ) {
      addActor(actors, cell, 'canopy', cellSize, canopyCount);
      canopyCount += 1;
    }
    if (
      limits.grassLayer
      && greaterRealmLodAllowsGroundcover(input.chunk.lod)
      && cell.groundcoverBasisPoints > 0
      && grassPatchCount < limits.grassPatches
    ) {
      const blades = Math.min(
        grassBladesForCell(cell, input.graphicsProfile),
        limits.grassBlades - grassBladeCount,
        Math.trunc((limits.grassTriangles - grassTriangleCount) / 3)
      );
      if (blades > 0) {
        addActor(actors, cell, 'grass', cellSize, grassPatchCount, blades, blades * 3);
        grassPatchCount += 1;
        grassBladeCount += blades;
        grassTriangleCount += blades * 3;
      }
    }
    if (
      limits.flowerLayer
      && greaterRealmLodAllowsGroundcover(input.chunk.lod)
      && cell.wildflowerBasisPoints > 0
      && flowerCount < limits.flowers
      && flowerGeometryBytes + 64 <= limits.flowerGeometryBytes
    ) {
      addActor(actors, cell, 'flower', cellSize, flowerCount, 0, 2, 64);
      flowerCount += 1;
      flowerGeometryBytes += 64;
    }
    if (!greaterRealmLodAllowsActors(input.chunk.lod)) continue;
    if (
      cell.passable
      && cell.ambienceClass >= GREATER_REALM_AMBIENCE_CLASS.CIVILIAN_FOOTFALL
      && npcCount < limits.npc
    ) {
      addActor(actors, cell, 'npc', cellSize, npcCount);
      npcCount += 1;
    }
    if (
      cell.ambienceClass === GREATER_REALM_AMBIENCE_CLASS.RABBIT_HABITAT
      && wildlifeCount < limits.wildlife
    ) {
      addActor(actors, cell, 'wildlife', cellSize, wildlifeCount);
      wildlifeCount += 1;
    }
    if (
      (cell.hydroRegime === GREATER_REALM_HYDRO_REGIME.RIVER
        || cell.hydroRegime === GREATER_REALM_HYDRO_REGIME.STREAM)
      && cell.hydroDepthClass >= 2
      && cell.hydroFlowDirection !== undefined
      && boatCount < limits.boat
    ) {
      addActor(
        actors,
        cell,
        'boat',
        cellSize,
        boatCount,
        0,
        0,
        0,
        cell.hydroFlowDirection
      );
      boatCount += 1;
    }
  }
  const elevationByCoordinate = new Map(
    cells.map((cell) => [greaterRealmCoordinateKey(cell), cell.elevation])
  );
  const resources = Object.freeze(input.chunk.resourceLocations.flatMap((location) => {
    const elevation = elevationByCoordinate.get(greaterRealmCoordinateKey(location));
    if (elevation === undefined) return [];
    return [Object.freeze({
      id: location.locationId,
      kind: location.resourceKind,
      nodeCount: location.nodeCount,
      position: coordinatePosition(
        location.atlasQ,
        location.atlasR,
        cellSize,
        elevation,
        0.12
      )
    })];
  }));
  const cellAccess = Object.freeze(cells.map((cell) => Object.freeze({
    cellKey: cell.cellKey,
    coordinateKey: greaterRealmCoordinateKey(cell),
    passable: cell.passable
  })));
  const blockedCoordinateKeys = Object.freeze(cellAccess.flatMap((cell) => (
    cell.passable ? [] : [cell.coordinateKey]
  )));
  const actorKinds = new Set(actors.map((actor) => actor.kind));
  const resourceKinds = new Set(resources.map((resource) => resource.kind));
  const drawCallCount = 1
    + Number(waterCells.length > 0)
    + Number(routes.segments.length > 0)
    + Number(routes.crossings.length > 0)
    + Number(boundaries.length > 0)
    + actorKinds.size
    + resourceKinds.size;
  const instanceCount = actors.length + routes.crossings.length + resources.length;
  // Exact-or-conservative GPU buffer accounting for the current Three scene:
  // custom geometry attributes, static primitive attributes/indices, instance
  // matrices/colors, and the separately reviewed flower geometry allowance.
  const estimatedUploadBytes = cells.length * 648
    + waterCells.length * 432
    + routes.segments.length * 48
    + routes.crossings.length * 76
    + (routes.crossings.length > 0 ? STATIC_GEOMETRY_BYTES.crossing : 0)
    + boundaries.length * 144
    + actors.length * 64
    + [...actorKinds].reduce((total, kind) => total + STATIC_GEOMETRY_BYTES[kind], 0)
    + resources.length * 64
    + resourceKinds.size * STATIC_GEOMETRY_BYTES.resource
    + flowerGeometryBytes;
  return Object.freeze({
    chunkHandle: input.chunk.chunkHandle,
    revision: input.chunk.revision,
    lod: input.chunk.lod,
    cellSize,
    terrainCells: cells,
    apronCoordinateKeys,
    waterCells,
    routeSegments: routes.segments,
    crossings: routes.crossings,
    sealedEdges: boundaries,
    actors: Object.freeze(actors),
    resources,
    cellAccess,
    blockedCoordinateKeys,
    drawCallCount,
    instanceCount,
    grassPatchCount,
    grassBladeCount,
    grassTriangleCount,
    grassDrawCallCount: Number(grassPatchCount > 0),
    flowerCount,
    flowerDrawCallCount: Number(flowerCount > 0),
    flowerGeometryBytes,
    estimatedUploadBytes
  });
}
