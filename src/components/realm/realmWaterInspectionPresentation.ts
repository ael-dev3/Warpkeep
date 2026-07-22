import type { HexCoord } from '../../game/map/hexCoordinates';
import {
  GENESIS_WATER_BODIES_V1,
  type GenesisWaterBodyV1,
  type GenesisWaterCellV1
} from '../../../spacetimedb/src/waterWorld';
import {
  isRealmTerrainKind,
  realmTerrainLabel,
  type RealmTerrainKind,
  type RealmTerrainSemanticRow
} from '../../game/map/realmTerrainSemantics';

export type RealmWaterInspectionRecord = Readonly<{
  cellKey: string;
  coord: HexCoord;
  bodyId: string;
  regime: 'ocean' | 'river';
  displayType: 'river' | 'coast' | 'outer-sea';
  displayName: string;
  description: string;
  riverOrdinal?: number;
  riverPosition?: 'source' | 'upper reach' | 'middle reach' | 'lower reach' | 'mouth';
  riverOrder?: number;
  riverCellCount?: number;
  sourceCellKey?: string;
  mouthCellKey?: string;
  sourceCoord?: HexCoord;
  mouthCoord?: HexCoord;
  downstreamWaterCellKey?: string;
  flowClass?: 'headwater' | 'branching reach' | 'main reach' | 'lower reach';
  oceanDepthClass?: 'coast' | 'open water';
  depthCells: number;
  fogBand: 'clear' | 'haze';
  underlyingTileKey?: string;
  underlyingTerrainKind?: RealmTerrainKind;
  underlyingTerrainLabel?: string;
  underlyingPassable?: boolean;
  gameplayBoundary: string;
}>;

export type RealmWaterNavigatorBody = Readonly<{
  bodyId: string;
  label: string;
  sourceCellKey: string;
  mouthCellKey: string;
  sourceCoord: HexCoord;
  mouthCoord: HexCoord;
}>;

function safeBodyMap(bodies: readonly GenesisWaterBodyV1[]) {
  return new Map(bodies.map((body) => [body.bodyId, body] as const));
}

function riverPosition(cell: GenesisWaterCellV1, body: GenesisWaterBodyV1) {
  const order = cell.riverOrder ?? 0;
  const progress = body.cellCount <= 1 ? 0 : order / Math.max(1, body.cellCount - 1);
  if (order === 0) return 'source' as const;
  if (order >= body.cellCount - 1) return 'mouth' as const;
  if (progress < 0.34) return 'upper reach' as const;
  if (progress < 0.67) return 'middle reach' as const;
  return 'lower reach' as const;
}

function riverFlowClass(cell: GenesisWaterCellV1) {
  if (cell.flowAccumulation <= 1) return 'headwater' as const;
  if (cell.flowAccumulation <= 3) return 'branching reach' as const;
  if (cell.flowAccumulation <= 8) return 'main reach' as const;
  return 'lower reach' as const;
}

function coordForCell(
  cellsByKey: ReadonlyMap<string, GenesisWaterCellV1>,
  cellKey: string
) {
  const cell = cellsByKey.get(cellKey);
  return cell ? { q: cell.q, r: cell.r } : undefined;
}

/**
 * Build bounded, read-only records from the already validated Water subset.
 * Full-fog cells and any unexpected lake rows fail closed rather than creating
 * browser-local identity or a misleading inspection surface.
 */
export function resolveRealmWaterInspectionRecords(
  cells: readonly GenesisWaterCellV1[] | undefined,
  terrainMetadata: readonly RealmTerrainSemanticRow[] = [],
  bodies: readonly GenesisWaterBodyV1[] = GENESIS_WATER_BODIES_V1
): readonly RealmWaterInspectionRecord[] {
  if (!cells || cells.some((cell) => cell.regime === 'lake')) return Object.freeze([]);
  const bodyMap = safeBodyMap(bodies);
  const cellsByKey = new Map(cells.map((cell) => [cell.cellKey, cell] as const));
  const terrainByKey = new Map<string, RealmTerrainSemanticRow>();
  for (const metadata of terrainMetadata) {
    if (
      typeof metadata.tileKey !== 'string'
      || metadata.tileKey.length === 0
      || terrainByKey.has(metadata.tileKey)
    ) return Object.freeze([]);
    terrainByKey.set(metadata.tileKey, metadata);
  }
  const records: RealmWaterInspectionRecord[] = [];

  for (const cell of cells) {
    if (
      cell.regime !== 'ocean' && cell.regime !== 'river'
      || cell.fogBand === 'full'
      || !Number.isSafeInteger(cell.q)
      || !Number.isSafeInteger(cell.r)
    ) continue;
    const body = bodyMap.get(cell.bodyId);
    if (!body || body.regime !== cell.regime) return Object.freeze([]);
    const coord = { q: cell.q, r: cell.r };
    if (cell.regime === 'river') {
      const ordinal = body.ordinal;
      const riverName = `Genesis River ${String(ordinal).padStart(2, '0')}`;
      const sourceCoord = coordForCell(cellsByKey, body.sourceCellKey);
      const mouthCoord = coordForCell(cellsByKey, body.mouthCellKey);
      const sourceCell = cellsByKey.get(body.sourceCellKey);
      const mouthCell = cellsByKey.get(body.mouthCellKey);
      if (
        !sourceCoord
        || !mouthCoord
        || sourceCell?.bodyId !== body.bodyId
        || sourceCell.regime !== 'river'
        || mouthCell?.bodyId !== body.bodyId
        || mouthCell.regime !== 'river'
      ) return Object.freeze([]);
      const underlying = cell.underlyingTileKey
        ? terrainByKey.get(cell.underlyingTileKey)
        : undefined;
      const underlyingTerrainKind = isRealmTerrainKind(underlying?.terrainKind)
        ? underlying.terrainKind
        : undefined;
      records.push(Object.freeze({
        cellKey: cell.cellKey,
        coord,
        bodyId: cell.bodyId,
        regime: 'river',
        displayType: 'river',
        displayName: riverName,
        description: 'A persistent Genesis watercourse crossing the Lowlands from source to mouth.',
        riverOrdinal: ordinal,
        riverPosition: riverPosition(cell, body),
        riverOrder: cell.riverOrder,
        riverCellCount: body.cellCount,
        sourceCellKey: body.sourceCellKey,
        mouthCellKey: body.mouthCellKey,
        sourceCoord,
        mouthCoord,
        downstreamWaterCellKey: cell.downstreamWaterCellKey,
        flowClass: riverFlowClass(cell),
        depthCells: cell.depthCells,
        fogBand: cell.fogBand,
        underlyingTileKey: cell.underlyingTileKey,
        underlyingTerrainKind,
        underlyingTerrainLabel: underlyingTerrainKind
          ? realmTerrainLabel(underlyingTerrainKind)
          : undefined,
        underlyingPassable: typeof underlying?.passable === 'boolean'
          ? underlying.passable
          : undefined,
        gameplayBoundary: 'Water is visual and does not add boats, swimming, current force, or resource rewards.'
      }));
      continue;
    }
    const isCoast = cell.oceanDepth <= 2;
    records.push(Object.freeze({
      cellKey: cell.cellKey,
      coord,
      bodyId: cell.bodyId,
      regime: 'ocean',
      displayType: isCoast ? 'coast' : 'outer-sea',
      displayName: isCoast ? 'Lowlands Coast' : 'Outer Sea',
      description: isCoast
        ? 'A clear coastal water cell at the edge of the Lowlands.'
        : 'Open water beyond the coast, presented within the public fog boundary.',
      oceanDepthClass: isCoast ? 'coast' : 'open water',
      depthCells: cell.depthCells,
      fogBand: cell.fogBand,
      gameplayBoundary: 'The sea is a shared visual boundary; it is not claimable territory.'
    }));
  }
  return Object.freeze(records);
}

export function realmWaterNavigatorBodies(
  records: readonly RealmWaterInspectionRecord[]
): readonly RealmWaterNavigatorBody[] {
  const byBody = new Map<string, RealmWaterInspectionRecord>();
  records.forEach((record) => {
    if (record.regime === 'river' && !byBody.has(record.bodyId)) byBody.set(record.bodyId, record);
  });
  return Object.freeze([...byBody.values()]
    .sort((left, right) => (left.riverOrdinal ?? 0) - (right.riverOrdinal ?? 0))
    .map((record) => Object.freeze({
      bodyId: record.bodyId,
      label: record.displayName,
      sourceCellKey: record.sourceCellKey!,
      mouthCellKey: record.mouthCellKey!,
      sourceCoord: record.sourceCoord!,
      mouthCoord: record.mouthCoord!
    })));
}
