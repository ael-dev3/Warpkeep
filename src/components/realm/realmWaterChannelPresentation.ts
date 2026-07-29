import {
  POINTY_TOP_AXIAL_DIRECTIONS,
  axialToWorld,
  hexDistance,
  hexKey,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';

/**
 * Public, presentation-only fields used to derive an internal center-current
 * lane. Canonical Water rows satisfy this shape; the complete authoritative
 * hex remains Water regardless of this lane.
 */
export type RealmWaterChannelCell = Readonly<{
  cellKey: string;
  q: number;
  r: number;
  regime: 'ocean' | 'lake' | 'river';
  bodyId?: string;
  riverOrder?: number;
  downstreamWaterCellKey?: string;
  flowAccumulation?: number;
  depthClass?: number;
  surfaceLevelMilli?: number;
  bankSeed?: number;
}>;

export type RealmWaterChannelSection = Readonly<{
  world: HexWorldPosition;
  halfWidth: number;
  cellKey: string;
  surfaceLevelMilli: number;
  foam: number;
  kind: 'source-cap' | 'cell' | 'mouth-edge';
}>;

export type RealmWaterChannelBodyPlan = Readonly<{
  bodyId: string;
  cellKeys: readonly string[];
  cells: readonly RealmWaterChannelCell[];
  mode: 'channel' | 'full-cell-fallback';
  fallbackReason?: string;
  sections: readonly RealmWaterChannelSection[];
  mouthConnectedToOcean: boolean;
}>;

export type RealmWaterChannelPlan = Readonly<{
  bodies: readonly RealmWaterChannelBodyPlan[];
  riverCellCount: number;
  channelBodyCount: number;
  fallbackBodyCount: number;
  fallbackCellCount: number;
  mouthConnectionCount: number;
}>;

function safeInteger(value: number) {
  return Number.isSafeInteger(value);
}

function finiteOr(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? value! : fallback;
}

function normalizedDirection(
  from: HexWorldPosition,
  to: HexWorldPosition
): HexWorldPosition | undefined {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  return length > 0.000_001
    ? Object.freeze({ x: x / length, z: z / length })
    : undefined;
}

/**
 * Width is deterministic and monotonic in the reviewed hydrology fields. It
 * remains comfortably inside a pointy hex's inradius. It may tune current,
 * foam, or color concentration, but never defines the physical Water extent.
 */
export function realmWaterChannelHalfWidth(
  cell: RealmWaterChannelCell,
  hexSize: number
) {
  const safeHexSize = Number.isFinite(hexSize) && hexSize > 0 ? hexSize : 1;
  const accumulation = Math.max(1, finiteOr(cell.flowAccumulation, 1));
  const accumulationFactor = Math.min(1, Math.log2(accumulation + 1) / 10);
  const depthFactor = Math.min(2, Math.max(0, finiteOr(cell.depthClass, 1) - 1));
  return safeHexSize * (0.235 + accumulationFactor * 0.105 + depthFactor * 0.0225);
}

function fallbackBody(
  bodyId: string,
  cells: readonly RealmWaterChannelCell[],
  reason: string
): RealmWaterChannelBodyPlan {
  return Object.freeze({
    bodyId,
    cellKeys: Object.freeze(cells.map((cell) => cell.cellKey)),
    cells: Object.freeze([...cells]),
    mode: 'full-cell-fallback',
    fallbackReason: reason,
    sections: Object.freeze([]),
    mouthConnectedToOcean: false
  });
}

function orderedRiverBody(
  bodyId: string,
  rows: readonly RealmWaterChannelCell[]
): Readonly<{ cells: readonly RealmWaterChannelCell[]; error?: string }> {
  if (rows.length === 0) return Object.freeze({ cells: Object.freeze([]), error: 'empty-body' });
  if (rows.some((cell) => (
    !safeInteger(cell.q)
    || !safeInteger(cell.r)
    || typeof cell.cellKey !== 'string'
    || cell.cellKey !== hexKey(cell)
    || typeof cell.bodyId !== 'string'
    || cell.bodyId !== bodyId
  ))) return Object.freeze({ cells: Object.freeze([...rows]), error: 'invalid-cell-identity' });
  const cellKeys = new Set(rows.map((cell) => cell.cellKey));
  if (cellKeys.size !== rows.length) {
    return Object.freeze({ cells: Object.freeze([...rows]), error: 'duplicate-cell' });
  }
  const everyOrderPresent = rows.every((cell) => (
    Number.isSafeInteger(cell.riverOrder) && cell.riverOrder! >= 0
  ));
  if (!everyOrderPresent && rows.length > 1) {
    return Object.freeze({ cells: Object.freeze([...rows]), error: 'missing-river-order' });
  }
  const ordered = [...rows].sort((left, right) => (
    finiteOr(left.riverOrder, 0) - finiteOr(right.riverOrder, 0)
    || left.cellKey.localeCompare(right.cellKey)
  ));
  if (
    ordered.some((cell, index) => everyOrderPresent && cell.riverOrder !== index)
    || ordered.slice(1).some((cell, index) => hexDistance(ordered[index]!, cell) !== 1)
  ) return Object.freeze({ cells: Object.freeze(ordered), error: 'discontinuous-order' });
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const declaredDownstream = ordered[index]!.downstreamWaterCellKey;
    if (
      declaredDownstream !== undefined
      && declaredDownstream !== ordered[index + 1]!.cellKey
    ) return Object.freeze({ cells: Object.freeze(ordered), error: 'downstream-mismatch' });
  }
  const finalDownstream = ordered.at(-1)!.downstreamWaterCellKey;
  if (finalDownstream !== undefined && cellKeys.has(finalDownstream)) {
    return Object.freeze({ cells: Object.freeze(ordered), error: 'mouth-cycle' });
  }
  return Object.freeze({ cells: Object.freeze(ordered) });
}

function mouthOceanNeighbor(
  mouth: RealmWaterChannelCell,
  previous: RealmWaterChannelCell | undefined,
  nonRiverByKey: ReadonlyMap<string, RealmWaterChannelCell>,
  hexSize: number
) {
  const mouthWorld = axialToWorld(mouth, hexSize);
  const previousWorld = previous ? axialToWorld(previous, hexSize) : undefined;
  const downstream = previousWorld
    ? normalizedDirection(previousWorld, mouthWorld)
    : undefined;
  return POINTY_TOP_AXIAL_DIRECTIONS
    .map((direction) => nonRiverByKey.get(hexKey({
      q: mouth.q + direction.q,
      r: mouth.r + direction.r
    })))
    .filter((candidate): candidate is RealmWaterChannelCell => candidate?.regime === 'ocean')
    .map((candidate) => {
      const world = axialToWorld(candidate, hexSize);
      const direction = normalizedDirection(mouthWorld, world);
      return {
        candidate,
        world,
        alignment: downstream && direction
          ? downstream.x * direction.x + downstream.z * direction.z
          : 0
      };
    })
    .sort((left, right) => (
      right.alignment - left.alignment
      || left.candidate.cellKey.localeCompare(right.candidate.cellKey)
    ))[0];
}

function bodySections(
  cells: readonly RealmWaterChannelCell[],
  nonRiverByKey: ReadonlyMap<string, RealmWaterChannelCell>,
  hexSize: number
) {
  const centers = cells.map((cell) => Object.freeze(axialToWorld(cell, hexSize)));
  const firstDirection = centers.length > 1
    ? normalizedDirection(centers[0]!, centers[1]!)
    : Object.freeze({ x: 0, z: 1 });
  if (!firstDirection) return undefined;
  const source = cells[0]!;
  const sourceWidth = realmWaterChannelHalfWidth(source, hexSize);
  const sourceWorld = Object.freeze({
    x: centers[0]!.x - firstDirection.x * hexSize * 0.42,
    z: centers[0]!.z - firstDirection.z * hexSize * 0.42
  });
  const sections: RealmWaterChannelSection[] = [Object.freeze({
    world: sourceWorld,
    halfWidth: sourceWidth * 0.82,
    cellKey: source.cellKey,
    surfaceLevelMilli: finiteOr(source.surfaceLevelMilli, 1_000),
    foam: 0.42,
    kind: 'source-cap'
  })];
  cells.forEach((cell, index) => {
    const incoming = index > 0
      ? normalizedDirection(centers[index - 1]!, centers[index]!)
      : firstDirection;
    const outgoing = index < cells.length - 1
      ? normalizedDirection(centers[index]!, centers[index + 1]!)
      : incoming;
    if (!incoming || !outgoing) return;
    const alignment = Math.max(-1, Math.min(1, incoming.x * outgoing.x + incoming.z * outgoing.z));
    const bendFoam = Math.min(0.24, (1 - alignment) * 0.18);
    const mouthFoam = index === cells.length - 1 ? 0.28 : 0;
    sections.push(Object.freeze({
      world: centers[index]!,
      halfWidth: realmWaterChannelHalfWidth(cell, hexSize),
      cellKey: cell.cellKey,
      surfaceLevelMilli: finiteOr(cell.surfaceLevelMilli, 1_000),
      foam: Math.max(0.045, bendFoam, mouthFoam),
      kind: 'cell'
    }));
  });
  const mouth = cells.at(-1)!;
  const previous = cells.length > 1 ? cells.at(-2) : undefined;
  const oceanNeighbor = mouthOceanNeighbor(mouth, previous, nonRiverByKey, hexSize);
  const mouthCenter = centers.at(-1)!;
  const lastDirection = previous
    ? normalizedDirection(centers.at(-2)!, mouthCenter)
    : firstDirection;
  if (!lastDirection) return undefined;
  const mouthWorld = oceanNeighbor
    ? Object.freeze({
      x: (mouthCenter.x + oceanNeighbor.world.x) * 0.5,
      z: (mouthCenter.z + oceanNeighbor.world.z) * 0.5
    })
    : Object.freeze({
      x: mouthCenter.x + lastDirection.x * hexSize * 0.42,
      z: mouthCenter.z + lastDirection.z * hexSize * 0.42
    });
  sections.push(Object.freeze({
    world: mouthWorld,
    halfWidth: Math.min(hexSize * 0.425, realmWaterChannelHalfWidth(mouth, hexSize) * 1.08),
    cellKey: mouth.cellKey,
    surfaceLevelMilli: finiteOr(mouth.surfaceLevelMilli, 1_000),
    foam: oceanNeighbor ? 0.94 : 0.68,
    kind: 'mouth-edge'
  }));
  return Object.freeze({
    sections: Object.freeze(sections),
    mouthConnectedToOcean: oceanNeighbor !== undefined
  });
}

/**
 * Build one stable internal flow lane per authoritative river body. Invalid
 * bodies retain explicit topology-fallback metadata while their cells still
 * render as complete Water hexes.
 */
export function createRealmWaterChannelPlan(
  values: readonly RealmWaterChannelCell[],
  hexSize = 1
): RealmWaterChannelPlan {
  const safeHexSize = Number.isFinite(hexSize) && hexSize > 0 ? hexSize : 1;
  const rivers = values.filter((cell) => cell.regime === 'river');
  const nonRiverByKey = new Map(values
    .filter((cell) => cell.regime !== 'river')
    .map((cell) => [cell.cellKey, cell] as const));
  const grouped = new Map<string, RealmWaterChannelCell[]>();
  rivers.forEach((cell) => {
    const bodyId = typeof cell.bodyId === 'string' && cell.bodyId.length > 0
      ? cell.bodyId
      : `invalid-body:${cell.cellKey}`;
    const bucket = grouped.get(bodyId);
    if (bucket) bucket.push(cell);
    else grouped.set(bodyId, [cell]);
  });
  const bodies = [...grouped]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bodyId, rows]): RealmWaterChannelBodyPlan => {
      const ordered = orderedRiverBody(bodyId, rows);
      if (ordered.error) return fallbackBody(bodyId, ordered.cells, ordered.error);
      const presentation = bodySections(ordered.cells, nonRiverByKey, safeHexSize);
      if (!presentation || presentation.sections.length < 3) {
        return fallbackBody(bodyId, ordered.cells, 'channel-plan-failed');
      }
      return Object.freeze({
        bodyId,
        cellKeys: Object.freeze(ordered.cells.map((cell) => cell.cellKey)),
        cells: ordered.cells,
        mode: 'channel',
        sections: presentation.sections,
        mouthConnectedToOcean: presentation.mouthConnectedToOcean
      });
    });
  const fallbackBodies = bodies.filter((body) => body.mode === 'full-cell-fallback');
  return Object.freeze({
    bodies: Object.freeze(bodies),
    riverCellCount: rivers.length,
    channelBodyCount: bodies.length - fallbackBodies.length,
    fallbackBodyCount: fallbackBodies.length,
    fallbackCellCount: fallbackBodies.reduce((sum, body) => sum + body.cells.length, 0),
    mouthConnectionCount: bodies.filter((body) => (
      body.mode === 'channel' && body.mouthConnectedToOcean
    )).length
  });
}
