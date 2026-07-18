import {
  axialToWorld,
  hexDistance,
  hexKey,
  type HexCoord,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import { sampleLowlandsColor } from '../../game/map/terrainColor';
import { terrainHeightForCell } from '../../game/map/terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  type TerrainStructurePlacement
} from '../../game/map/terrainPlacements';
import type { RealmTerrainMap } from '../../game/map/terrainTypes';
import type { RealmTerrainKind } from '../../game/map/realmTerrainSemantics';

const SQRT_3 = Math.sqrt(3);
const CORNER_COUNT = 6;
export const DEFAULT_TERRAIN_SUBDIVISIONS = 8;
export { sampleLowlandsColor };

export type TerrainBounds = Readonly<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}>;

/** Renderer-neutral indexed data used by the direct Three.js terrain surface. */
export type TerrainGeometryData = Readonly<{
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
  bounds: TerrainBounds;
  /** Exact convex x/z perimeter of the rendered union of terrain hexes. */
  overviewHull: readonly HexWorldPosition[];
  vertexCount: number;
  triangleCount: number;
  degenerateTriangleCount: number;
  sharedVertexReuseCount: number;
  surfaceCellCount: number;
  highDetailCellCount: number;
  coarseCellCount: number;
  transitionEdgeCount: number;
  detailRadius: number;
  subdivisionsPerEdge: number;
  outerSubdivisionsPerEdge: 1;
}>;

export type TerrainGeometryOptions = Readonly<{
  subdivisionsPerEdge?: number;
  /** Cells through this radius retain the established triangular lattice. */
  adaptiveDetailRadius?: number;
  playableRadius?: number;
  placements?: readonly TerrainStructurePlacement[];
  terrainKindsByKey?: ReadonlyMap<string, RealmTerrainKind>;
}>;

type MutableTerrainBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export function pointyHexCorners(coord: HexCoord, hexSize: number): HexWorldPosition[] {
  const center = axialToWorld(coord, hexSize);
  const size = Math.max(0.001, Number.isFinite(hexSize) ? hexSize : 1);
  return Array.from({ length: CORNER_COUNT }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / CORNER_COUNT;
    return {
      x: center.x + Math.cos(angle) * size,
      z: center.z + Math.sin(angle) * size
    };
  });
}

function pointKey(point: HexWorldPosition) {
  const precision = 1_000_000;
  return `${Math.round(point.x * precision)},${Math.round(point.z * precision)}`;
}

function hullCross(
  origin: HexWorldPosition,
  first: HexWorldPosition,
  second: HexWorldPosition
) {
  return (first.x - origin.x) * (second.z - origin.z)
    - (first.z - origin.z) * (second.x - origin.x);
}

/**
 * Return the actual convex perimeter of the rendered hex union. A Realm disc
 * has small corner chamfers, so this is intentionally derived from cell
 * corners rather than approximated by either the terrain AABB or a regular
 * six-point center hull.
 */
export function createTerrainOverviewHull(
  map: RealmTerrainMap,
  hexSize: number
): readonly HexWorldPosition[] {
  const byKey = new Map<string, HexWorldPosition>();
  map.cells.forEach((cell) => {
    pointyHexCorners(cell.coord, hexSize).forEach((point) => {
      const key = pointKey(point);
      if (!byKey.has(key)) byKey.set(key, point);
    });
  });
  const points = [...byKey.values()].sort((left, right) => (
    left.x - right.x || left.z - right.z
  ));
  if (points.length <= 2) return Object.freeze(points.map((point) => Object.freeze({ ...point })));

  const lower: HexWorldPosition[] = [];
  points.forEach((point) => {
    while (
      lower.length >= 2
      && hullCross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 1e-9
    ) lower.pop();
    lower.push(point);
  });
  const upper: HexWorldPosition[] = [];
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    while (
      upper.length >= 2
      && hullCross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 1e-9
    ) upper.pop();
    upper.push(point);
  }
  return Object.freeze(
    [...lower.slice(0, -1), ...upper.slice(0, -1)]
      .map((point) => Object.freeze({ x: point.x, z: point.z }))
  );
}

function calculateTriangleArea(
  positions: readonly number[],
  first: number,
  second: number,
  third: number
) {
  const firstOffset = first * 3;
  const secondOffset = second * 3;
  const thirdOffset = third * 3;
  const abX = positions[secondOffset] - positions[firstOffset];
  const abY = positions[secondOffset + 1] - positions[firstOffset + 1];
  const abZ = positions[secondOffset + 2] - positions[firstOffset + 2];
  const acX = positions[thirdOffset] - positions[firstOffset];
  const acY = positions[thirdOffset + 1] - positions[firstOffset + 1];
  const acZ = positions[thirdOffset + 2] - positions[firstOffset + 2];
  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;
  return Math.hypot(crossX, crossY, crossZ) * 0.5;
}

function safeSubdivisionCount(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_TERRAIN_SUBDIVISIONS;
  return Math.min(16, Math.max(1, Math.trunc(value)));
}

function safeDetailRadius(value: number | undefined, renderRadius: number) {
  if (value === undefined) return renderRadius;
  if (!Number.isFinite(value)) return renderRadius;
  return Math.min(renderRadius, Math.max(0, Math.trunc(value)));
}

/** Neighbor across the outer edge of each pointy-hex radial wedge. */
const WEDGE_NEIGHBOR_DIRECTIONS: readonly HexCoord[] = Object.freeze([
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 0, r: 1 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: 0, r: -1 })
]);

function interpolateTriangle(
  center: HexWorldPosition,
  firstCorner: HexWorldPosition,
  secondCorner: HexWorldPosition,
  firstWeight: number,
  secondWeight: number
): HexWorldPosition {
  const centerWeight = 1 - firstWeight - secondWeight;
  return {
    x: center.x * centerWeight + firstCorner.x * firstWeight + secondCorner.x * secondWeight,
    z: center.z * centerWeight + firstCorner.z * firstWeight + secondCorner.z * secondWeight
  };
}

/**
 * Construct one tessellated indexed surface for every logical cell.
 *
 * Each logical hex remains a single gameplay cell. The founding district uses
 * its established triangular lattice; expansion cells use one triangle per
 * wedge. A coarse wedge touching that lattice fans across the same segmented
 * edge, avoiding a T-junction without globally multiplying outer topology.
 * Vertices are keyed in world space so every shared border resolves to one
 * indexed point and the existing boundary falloff stays height-continuous.
 */
export function createTerrainGeometryData(
  map: RealmTerrainMap,
  hexSize: number,
  subdivisionsOrOptions: number | TerrainGeometryOptions = DEFAULT_TERRAIN_SUBDIVISIONS
): TerrainGeometryData {
  const options = typeof subdivisionsOrOptions === 'number'
    ? { subdivisionsPerEdge: subdivisionsOrOptions }
    : subdivisionsOrOptions;
  const placements = options.placements ?? EMPTY_TERRAIN_PLACEMENTS;
  const subdivisions = safeSubdivisionCount(options.subdivisionsPerEdge ?? DEFAULT_TERRAIN_SUBDIVISIONS);
  const detailRadius = safeDetailRadius(options.adaptiveDetailRadius, map.radius);
  const mapCellKeys = new Set(map.cells.map((cell) => hexKey(cell.coord)));
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<string, number>();
  let sharedVertexReuseCount = 0;
  let highDetailCellCount = 0;
  let coarseCellCount = 0;
  let transitionEdgeCount = 0;
  const bounds: MutableTerrainBounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  };

  const addVertex = (
    key: string,
    world: HexWorldPosition,
    height: number,
    cell: RealmTerrainMap['cells'][number]
  ) => {
    const existing = vertices.get(key);
    if (existing !== undefined) {
      sharedVertexReuseCount += 1;
      return existing;
    }
    const color = sampleLowlandsColor(map.worldSeed, world, {
      cell,
      hexSize,
      playableRadius: options.playableRadius ?? Math.max(0, map.radius - 1),
      renderRadius: map.radius,
      terrainKind: options.terrainKindsByKey?.get(hexKey(cell.coord)),
      placements
    });
    const index = positions.length / 3;
    vertices.set(key, index);
    positions.push(world.x, height, world.z);
    colors.push(color.r, color.g, color.b);
    bounds.minX = Math.min(bounds.minX, world.x);
    bounds.maxX = Math.max(bounds.maxX, world.x);
    bounds.minY = Math.min(bounds.minY, height);
    bounds.maxY = Math.max(bounds.maxY, height);
    bounds.minZ = Math.min(bounds.minZ, world.z);
    bounds.maxZ = Math.max(bounds.maxZ, world.z);
    return index;
  };

  const addLatticeWedge = (
    cell: RealmTerrainMap['cells'][number],
    center: HexWorldPosition,
    corner: HexWorldPosition,
    nextCorner: HexWorldPosition,
    wedgeSubdivisions: number
  ) => {
    const rows: number[][] = [];
    for (let first = 0; first <= wedgeSubdivisions; first += 1) {
      rows[first] = [];
      for (let second = 0; second <= wedgeSubdivisions - first; second += 1) {
        const world = interpolateTriangle(
          center,
          nextCorner,
          corner,
          first / wedgeSubdivisions,
          second / wedgeSubdivisions
        );
        rows[first][second] = addVertex(
          `surface:${pointKey(world)}`,
          world,
          terrainHeightForCell(map.worldSeed, cell, world, hexSize, placements),
          cell
        );
      }
    }

    for (let first = 0; first < wedgeSubdivisions; first += 1) {
      for (let second = 0; second < wedgeSubdivisions - first; second += 1) {
        const origin = rows[first][second];
        const alongFirst = rows[first + 1][second];
        const alongSecond = rows[first][second + 1];
        // This x/z winding points normals upward along Three.js's +y axis.
        indices.push(origin, alongFirst, alongSecond);

        if (first + second < wedgeSubdivisions - 1) {
          const opposite = rows[first + 1][second + 1];
          indices.push(alongFirst, opposite, alongSecond);
        }
      }
    }
  };

  const addTransitionFan = (
    cell: RealmTerrainMap['cells'][number],
    center: HexWorldPosition,
    corner: HexWorldPosition,
    nextCorner: HexWorldPosition
  ) => {
    const centerIndex = addVertex(
      `surface:${pointKey(center)}`,
      center,
      terrainHeightForCell(map.worldSeed, cell, center, hexSize, placements),
      cell
    );
    const edge: number[] = [];
    for (let segment = 0; segment <= subdivisions; segment += 1) {
      // Match the established lattice's barycentric operation exactly so the
      // rounded world-space key resolves to one shared transition vertex.
      const world = interpolateTriangle(
        center,
        nextCorner,
        corner,
        (subdivisions - segment) / subdivisions,
        segment / subdivisions
      );
      edge.push(addVertex(
        `surface:${pointKey(world)}`,
        world,
        terrainHeightForCell(map.worldSeed, cell, world, hexSize, placements),
        cell
      ));
    }
    for (let segment = 0; segment < subdivisions; segment += 1) {
      indices.push(centerIndex, edge[segment], edge[segment + 1]);
    }
  };

  map.cells.forEach((cell) => {
    const center = axialToWorld(cell.coord, hexSize);
    const corners = pointyHexCorners(cell.coord, hexSize);
    const highDetail = hexDistance({ q: 0, r: 0 }, cell.coord) <= detailRadius;
    if (highDetail) highDetailCellCount += 1;
    else coarseCellCount += 1;

    corners.forEach((corner, cornerIndex) => {
      const nextCorner = corners[(cornerIndex + 1) % corners.length];
      if (highDetail) {
        addLatticeWedge(cell, center, corner, nextCorner, subdivisions);
        return;
      }

      const direction = WEDGE_NEIGHBOR_DIRECTIONS[cornerIndex]!;
      const neighbor = {
        q: cell.coord.q + direction.q,
        r: cell.coord.r + direction.r
      };
      const transition = mapCellKeys.has(hexKey(neighbor))
        && hexDistance({ q: 0, r: 0 }, neighbor) <= detailRadius;
      if (transition) {
        transitionEdgeCount += 1;
        addTransitionFan(cell, center, corner, nextCorner);
      } else {
        addLatticeWedge(cell, center, corner, nextCorner, 1);
      }
    });
  });

  let degenerateTriangleCount = 0;
  for (let index = 0; index < indices.length; index += 3) {
    if (calculateTriangleArea(positions, indices[index], indices[index + 1], indices[index + 2]) <= 1e-9) {
      degenerateTriangleCount += 1;
    }
  }

  const vertexCount = positions.length / 3;
  const typedIndices = vertexCount <= 0xffff ? new Uint16Array(indices) : new Uint32Array(indices);
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    indices: typedIndices,
    bounds,
    overviewHull: createTerrainOverviewHull(map, hexSize),
    vertexCount,
    triangleCount: indices.length / 3,
    degenerateTriangleCount,
    sharedVertexReuseCount,
    surfaceCellCount: map.cells.length,
    highDetailCellCount,
    coarseCellCount,
    transitionEdgeCount,
    detailRadius,
    subdivisionsPerEdge: subdivisions,
    outerSubdivisionsPerEdge: 1
  };
}

export const POINTY_TOP_HEX_WIDTH = SQRT_3;
