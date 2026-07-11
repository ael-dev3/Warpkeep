import { axialToWorld, type HexCoord, type HexWorldPosition } from '../../game/map/hexCoordinates';
import { sampleLowlandsColor } from '../../game/map/terrainColor';
import { terrainHeightForCell } from '../../game/map/terrainHeight';
import {
  HEGEMONY_TERRAIN_PLACEMENTS,
  type TerrainStructurePlacement
} from '../../game/map/terrainPlacements';
import type { RealmTerrainMap } from '../../game/map/terrainTypes';

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
  vertexCount: number;
  triangleCount: number;
  degenerateTriangleCount: number;
  sharedVertexReuseCount: number;
  surfaceCellCount: number;
  subdivisionsPerEdge: number;
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
 * Each logical hex remains a single gameplay cell, but each of its six radial
 * wedges is subdivided into a triangular lattice. Vertices are keyed in world
 * space so shared cell borders use the same point and the existing boundary
 * falloff keeps their height exactly continuous.
 */
export function createTerrainGeometryData(
  map: RealmTerrainMap,
  hexSize: number,
  subdivisionsOrOptions: number | Readonly<{
    subdivisionsPerEdge?: number;
    playableRadius?: number;
    placements?: readonly TerrainStructurePlacement[];
  }> = DEFAULT_TERRAIN_SUBDIVISIONS
): TerrainGeometryData {
  const options = typeof subdivisionsOrOptions === 'number'
    ? { subdivisionsPerEdge: subdivisionsOrOptions }
    : subdivisionsOrOptions;
  const placements = options.placements ?? HEGEMONY_TERRAIN_PLACEMENTS;
  const subdivisions = safeSubdivisionCount(options.subdivisionsPerEdge ?? DEFAULT_TERRAIN_SUBDIVISIONS);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<string, number>();
  let sharedVertexReuseCount = 0;
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

  map.cells.forEach((cell) => {
    const center = axialToWorld(cell.coord, hexSize);
    const corners = pointyHexCorners(cell.coord, hexSize);
    corners.forEach((corner, cornerIndex) => {
      const nextCorner = corners[(cornerIndex + 1) % corners.length];
      const rows: number[][] = [];

      for (let first = 0; first <= subdivisions; first += 1) {
        rows[first] = [];
        for (let second = 0; second <= subdivisions - first; second += 1) {
          const world = interpolateTriangle(
            center,
            nextCorner,
            corner,
            first / subdivisions,
            second / subdivisions
          );
          rows[first][second] = addVertex(
            `surface:${pointKey(world)}`,
            world,
            terrainHeightForCell(map.worldSeed, cell, world, hexSize, placements),
            cell
          );
        }
      }

      for (let first = 0; first < subdivisions; first += 1) {
        for (let second = 0; second < subdivisions - first; second += 1) {
          const origin = rows[first][second];
          const alongFirst = rows[first + 1][second];
          const alongSecond = rows[first][second + 1];
          // This x/z winding points normals upward along Three.js's +y axis.
          indices.push(origin, alongFirst, alongSecond);

          if (first + second < subdivisions - 1) {
            const opposite = rows[first + 1][second + 1];
            indices.push(alongFirst, opposite, alongSecond);
          }
        }
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
    vertexCount,
    triangleCount: indices.length / 3,
    degenerateTriangleCount,
    sharedVertexReuseCount,
    surfaceCellCount: map.cells.length,
    subdivisionsPerEdge: subdivisions
  };
}

export const POINTY_TOP_HEX_WIDTH = SQRT_3;
