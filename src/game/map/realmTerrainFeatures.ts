import {
  axialToWorld,
  hexKey,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import { deriveChannelSeed, seededUnitFloat } from './realmSeed';
import type { RealmTerrainKind } from './realmTerrainSemantics';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  isPlacementClear,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from './terrainPlacements';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

export type RealmTerrainFeatureKind =
  | 'forest-tree'
  | 'heath-bloom'
  | 'ridge-outcrop'
  | 'lake-sheen'
  | 'ancient-monolith';

export type RealmTerrainFeatureQuality = 'high' | 'balanced' | 'reduced';

export type RealmTerrainFeaturePoint = Readonly<{
  kind: RealmTerrainFeatureKind;
  coord: HexCoord;
  world: HexWorldPosition;
  rotation: number;
  scale: number;
}>;

export type RealmTerrainFeatureData = Readonly<{
  points: readonly RealmTerrainFeaturePoint[];
  counts: Readonly<Record<RealmTerrainFeatureKind, number>>;
  budget: number;
}>;

export const REALM_TERRAIN_FEATURE_BUDGETS: Readonly<
  Record<RealmTerrainFeatureQuality, number>
> = Object.freeze({ high: 1_100, balanced: 800, reduced: 400 });

const FEATURE_KINDS: readonly RealmTerrainFeatureKind[] = Object.freeze([
  'forest-tree',
  'heath-bloom',
  'ridge-outcrop',
  'lake-sheen',
  'ancient-monolith'
]);
const FEATURE_CLEARANCE = 0.045;

function featureKindForTerrain(kind: RealmTerrainKind): RealmTerrainFeatureKind | undefined {
  if (kind === 'forest') return 'forest-tree';
  if (kind === 'heath') return 'heath-bloom';
  if (kind === 'ridge') return 'ridge-outcrop';
  if (kind === 'lake') return 'lake-sheen';
  if (kind === 'ancient-stone') return 'ancient-monolith';
  return undefined;
}

function featureCountForCell(
  cell: TerrainCell,
  terrainKind: RealmTerrainKind,
  quality: RealmTerrainFeatureQuality
) {
  if (terrainKind === 'forest') {
    if (quality === 'high') return 2;
    if (quality === 'balanced') return 1;
    return seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'forest-reduced-presence')) < 0.5
      ? 1
      : 0;
  }
  if (terrainKind === 'heath') return quality === 'reduced' ? 0 : 1;
  return featureKindForTerrain(terrainKind) === undefined ? 0 : 1;
}

function candidateWorld(
  cell: TerrainCell,
  featureKind: RealmTerrainFeatureKind,
  index: number,
  attempt: number,
  hexSize: number
): HexWorldPosition {
  const center = axialToWorld(cell.coord, hexSize);
  if (featureKind === 'lake-sheen' || featureKind === 'ancient-monolith') return center;
  const angle = seededUnitFloat(
    deriveChannelSeed(cell.seed, index, attempt, `${featureKind}-angle`)
  ) * Math.PI * 2;
  const radius = Math.sqrt(seededUnitFloat(
    deriveChannelSeed(cell.seed, index, attempt, `${featureKind}-radius`)
  )) * hexSize * (featureKind === 'forest-tree' ? 0.52 : 0.46);
  return {
    x: center.x + Math.cos(angle) * radius,
    z: center.z + Math.sin(angle) * radius
  };
}

function createFeaturePoint(
  cell: TerrainCell,
  kind: RealmTerrainFeatureKind,
  index: number,
  hexSize: number,
  placements: readonly TerrainStructurePlacement[]
): RealmTerrainFeaturePoint | undefined {
  const localPlacements = terrainPlacementsForCell(
    placements,
    cell.coord,
    hexSize,
    FEATURE_CLEARANCE
  );
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const world = candidateWorld(cell, kind, index, attempt, hexSize);
    if (!isPlacementClear(localPlacements, world, hexSize, FEATURE_CLEARANCE)) continue;
    return Object.freeze({
      kind,
      coord: Object.freeze({ ...cell.coord }),
      world: Object.freeze(world),
      rotation: seededUnitFloat(
        deriveChannelSeed(cell.seed, index, attempt, `${kind}-rotation`)
      ) * Math.PI * 2,
      scale: 0.82 + seededUnitFloat(
        deriveChannelSeed(cell.seed, index, attempt, `${kind}-scale`)
      ) * 0.36
    });
  }
  return undefined;
}

/**
 * Convert server-owned terrain kinds into restrained scenic geometry only.
 * These features are non-interactive and intentionally do not expose future
 * resource/core-capable metadata as implemented gameplay.
 */
export function generateRealmTerrainFeatures(
  renderMap: RealmTerrainMap,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  quality: RealmTerrainFeatureQuality,
  hexSize = 1,
  placements: readonly TerrainStructurePlacement[] = EMPTY_TERRAIN_PLACEMENTS,
  suppressedTileKeys: ReadonlySet<string> = new Set()
): RealmTerrainFeatureData {
  const points: RealmTerrainFeaturePoint[] = [];
  renderMap.cells.forEach((cell) => {
    const tileKey = hexKey(cell.coord);
    if (suppressedTileKeys.has(tileKey)) return;
    const terrainKind = terrainKindsByKey.get(tileKey);
    if (terrainKind === undefined) return;
    const featureKind = featureKindForTerrain(terrainKind);
    if (featureKind === undefined) return;
    const count = featureCountForCell(cell, terrainKind, quality);
    for (let index = 0; index < count; index += 1) {
      const point = createFeaturePoint(cell, featureKind, index, hexSize, placements);
      if (point) points.push(point);
    }
  });

  const budget = REALM_TERRAIN_FEATURE_BUDGETS[quality];
  if (points.length > budget) throw new Error('REALM_TERRAIN_FEATURE_BUDGET_EXCEEDED');
  const counts = Object.fromEntries(FEATURE_KINDS.map((kind) => [
    kind,
    points.filter((point) => point.kind === kind).length
  ])) as Record<RealmTerrainFeatureKind, number>;
  return Object.freeze({
    points: Object.freeze(points),
    counts: Object.freeze(counts),
    budget
  });
}
