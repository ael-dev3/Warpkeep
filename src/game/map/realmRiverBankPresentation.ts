import {
  POINTY_TOP_AXIAL_DIRECTIONS,
  axialToWorld,
  hexKey,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';

export type RealmRiverBankWaterCell = Readonly<{
  cellKey: string;
  q: number;
  r: number;
  regime: 'ocean' | 'lake' | 'river';
}>;

export type RealmRiverEdgeKind = 'river' | 'ocean' | 'lake' | 'land';

export type RealmRiverBoundaryEdge = Readonly<{
  riverCellKey: string;
  neighborCellKey: string;
  kind: RealmRiverEdgeKind;
  side: number;
  cornerIndices: readonly [number, number];
  start: HexWorldPosition;
  end: HexWorldPosition;
  /** Unit vector pointing from the river edge into adjacent land. */
  landward?: HexWorldPosition;
}>;

export type RealmRiverBankPresentationTelemetry = Readonly<{
  riverCellCount: number;
  fullCellWaterCount: number;
  riverBoundaryEdgeCount: number;
  riverSharedEdgeCount: number;
  riverMouthEdgeCount: number;
  invalidWaterCellCount: number;
}>;

export type RealmRiverBankPresentation = Readonly<{
  isFullCellWater: (world: HexWorldPosition) => boolean;
  bankInfluenceAtWorld: (world: HexWorldPosition, falloff?: number) => number;
  edgesForRiverCell: (cellKey: string) => readonly RealmRiverBoundaryEdge[];
  telemetry: RealmRiverBankPresentationTelemetry;
}>;

const EMPTY_EDGES: readonly RealmRiverBoundaryEdge[] = Object.freeze([]);
const SQRT_3 = Math.sqrt(3);

/**
 * Pointy-top side order corresponding to `POINTY_TOP_AXIAL_DIRECTIONS`.
 * The pairs index the canonical corners beginning at the north point and
 * advancing clockwise.
 */
const SIDE_CORNER_INDICES: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([1, 2] as const),
  Object.freeze([0, 1] as const),
  Object.freeze([5, 0] as const),
  Object.freeze([4, 5] as const),
  Object.freeze([3, 4] as const),
  Object.freeze([2, 3] as const)
]);

function safeHexSize(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function hasSafeCoordinate(cell: RealmRiverBankWaterCell) {
  return Number.isSafeInteger(cell.q)
    && Number.isSafeInteger(cell.r);
}

function hasExactIdentity(cell: RealmRiverBankWaterCell) {
  return hasSafeCoordinate(cell)
    && typeof cell.cellKey === 'string'
    && cell.cellKey === hexKey(cell);
}

function pointyHexCorners(
  coord: HexCoord,
  hexSize: number
): readonly HexWorldPosition[] {
  const center = axialToWorld(coord, hexSize);
  return Object.freeze(Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + Math.PI * 2 * index / 6;
    return Object.freeze({
      x: center.x + Math.cos(angle) * hexSize,
      z: center.z + Math.sin(angle) * hexSize
    });
  }));
}

function segmentDistance(
  world: HexWorldPosition,
  start: HexWorldPosition,
  end: HexWorldPosition
) {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(world.x - start.x, world.z - start.z);
  }
  const progress = Math.min(1, Math.max(0, (
    (world.x - start.x) * segmentX + (world.z - start.z) * segmentZ
  ) / lengthSquared));
  return Math.hypot(
    world.x - (start.x + segmentX * progress),
    world.z - (start.z + segmentZ * progress)
  );
}

function smoothFalloff(distance: number, falloff: number) {
  if (!Number.isFinite(distance) || !Number.isFinite(falloff) || falloff <= 0) return 0;
  const normalized = Math.min(1, Math.max(0, 1 - distance / falloff));
  return normalized * normalized * (3 - normalized * 2);
}

/**
 * Build the presentation-only boundary between canonical full-cell rivers and
 * adjacent land. The field never changes Water identity, terrain rows, or
 * routing; callers consume it only for bounded color and vegetation cues.
 */
export function createRealmRiverBankPresentation(
  cells: readonly RealmRiverBankWaterCell[],
  hexSizeInput = 1
): RealmRiverBankPresentation {
  const hexSize = safeHexSize(hexSizeInput);
  const coordinateCandidates = [...cells]
    .filter(hasSafeCoordinate)
    .sort((left, right) => (
      left.q - right.q
      || left.r - right.r
      || Number(hasExactIdentity(right)) - Number(hasExactIdentity(left))
      || left.cellKey.localeCompare(right.cellKey)
    ));
  const cellsByKey = new Map<string, RealmRiverBankWaterCell>();
  coordinateCandidates.forEach((cell) => {
    const coordinateKey = hexKey(cell);
    if (!cellsByKey.has(coordinateKey)) cellsByKey.set(coordinateKey, cell);
  });
  const validCells = [...cellsByKey.values()];
  const invalidWaterCellCount = cells.length - validCells.filter(hasExactIdentity).length;
  const fullCellWaterKeys = new Set(cellsByKey.keys());
  const edgesByRiverCell = new Map<string, RealmRiverBoundaryEdge[]>();
  const bankEdgesByProbeCell = new Map<string, RealmRiverBoundaryEdge[]>();
  const sharedRiverEdges = new Set<string>();
  let riverBoundaryEdgeCount = 0;
  let riverMouthEdgeCount = 0;

  validCells.filter((cell) => cell.regime === 'river').forEach((cell) => {
    const corners = pointyHexCorners(cell, hexSize);
    const edges: RealmRiverBoundaryEdge[] = [];
    POINTY_TOP_AXIAL_DIRECTIONS.forEach((direction, side) => {
      const neighborCoord = {
        q: cell.q + direction.q,
        r: cell.r + direction.r
      };
      const neighborCellKey = hexKey(neighborCoord);
      const neighbor = cellsByKey.get(neighborCellKey);
      const kind: RealmRiverEdgeKind = neighbor?.regime ?? 'land';
      const cornerIndices = SIDE_CORNER_INDICES[side]!;
      const riverCenter = axialToWorld(cell, hexSize);
      const neighborCenter = axialToWorld(neighborCoord, hexSize);
      const landwardLength = Math.hypot(
        neighborCenter.x - riverCenter.x,
        neighborCenter.z - riverCenter.z
      );
      const edge = Object.freeze({
        riverCellKey: cell.cellKey,
        neighborCellKey,
        kind,
        side,
        cornerIndices,
        start: corners[cornerIndices[0]]!,
        end: corners[cornerIndices[1]]!,
        ...(kind === 'land' && landwardLength > 0.000_001
          ? {
              landward: Object.freeze({
                x: (neighborCenter.x - riverCenter.x) / landwardLength,
                z: (neighborCenter.z - riverCenter.z) / landwardLength
              })
            }
          : {})
      });
      edges.push(edge);
      if (kind === 'river') {
        sharedRiverEdges.add(
          [cell.cellKey, neighborCellKey].sort().join('|')
        );
      } else if (kind === 'ocean') {
        riverMouthEdgeCount += 1;
      } else if (kind === 'land') {
        riverBoundaryEdgeCount += 1;
        for (const probeCellKey of [neighborCellKey, hexKey(cell)]) {
          const bankEdges = bankEdgesByProbeCell.get(probeCellKey);
          if (bankEdges) bankEdges.push(edge);
          else bankEdgesByProbeCell.set(probeCellKey, [edge]);
        }
      }
    });
    edgesByRiverCell.set(cell.cellKey, edges);
    if (cell.cellKey !== hexKey(cell)) edgesByRiverCell.set(hexKey(cell), edges);
  });

  const immutableEdgesByRiverCell = new Map(
    [...edgesByRiverCell].map(([key, edges]) => [
      key,
      Object.freeze([...edges])
    ] as const)
  );
  const immutableBankEdgesByProbeCell = new Map(
    [...bankEdgesByProbeCell].map(([key, edges]) => [
      key,
      Object.freeze([...edges])
    ] as const)
  );
  const telemetry = Object.freeze({
    riverCellCount: validCells.filter((cell) => cell.regime === 'river').length,
    fullCellWaterCount: fullCellWaterKeys.size,
    riverBoundaryEdgeCount,
    riverSharedEdgeCount: sharedRiverEdges.size,
    riverMouthEdgeCount,
    invalidWaterCellCount
  });

  return Object.freeze({
    isFullCellWater: (world) => {
      if (fullCellWaterKeys.size === 0) return false;
      if (!Number.isFinite(world.x) || !Number.isFinite(world.z)) return false;
      return fullCellWaterKeys.has(hexKey(worldToNearestAxial(world, hexSize)));
    },
    bankInfluenceAtWorld: (world, falloffInput = 0.28 * hexSize) => {
      if (immutableBankEdgesByProbeCell.size === 0) return 0;
      if (!Number.isFinite(world.x) || !Number.isFinite(world.z)) return 0;
      const nearestCellKey = hexKey(worldToNearestAxial(world, hexSize));
      const edges = immutableBankEdgesByProbeCell.get(nearestCellKey) ?? EMPTY_EDGES;
      const falloff = Number.isFinite(falloffInput)
        ? Math.min(SQRT_3 * hexSize * 0.5, Math.max(0, falloffInput))
        : 0.28 * hexSize;
      let influence = 0;
      edges.forEach((edge) => {
        const midpointX = (edge.start.x + edge.end.x) * 0.5;
        const midpointZ = (edge.start.z + edge.end.z) * 0.5;
        const signedLandwardDistance = edge.landward
          ? (world.x - midpointX) * edge.landward.x
            + (world.z - midpointZ) * edge.landward.z
          : Number.NEGATIVE_INFINITY;
        if (signedLandwardDistance < -0.000_001) return;
        influence = Math.max(
          influence,
          smoothFalloff(segmentDistance(world, edge.start, edge.end), falloff)
        );
      });
      return influence;
    },
    edgesForRiverCell: (cellKey) => (
      immutableEdgesByRiverCell.get(cellKey) ?? EMPTY_EDGES
    ),
    telemetry
  });
}
