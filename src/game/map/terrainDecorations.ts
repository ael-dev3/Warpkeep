import {
  axialToWorld,
  hexDistance,
  hexKey,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import { createDeterministicBudgetCollector } from './deterministicBudget';
import { deriveChannelSeed, seededUnitFloat } from './realmSeed';
import type { RealmTerrainKind } from './realmTerrainSemantics';
import { pointyHexBoundaryDistance } from './terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  isPlacementClear,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from './terrainPlacements';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

/** The former green/dry tuft path moved into the procedural grass layer. */
export type TerrainDecorationKind = 'stone';

export type TerrainDecorationPoint = Readonly<{
  kind: 'stone';
  coord: HexCoord;
  world: HexWorldPosition;
  rotation: number;
  scale: number;
  apron: boolean;
}>;

export type TerrainDecorationData = Readonly<{
  points: readonly TerrainDecorationPoint[];
  counts: Readonly<Record<TerrainDecorationKind, number>>;
}>;

export type TerrainDecorationQuality = Readonly<{
  playableRadius: number;
  stoneChancePlayable: number;
  stoneChanceApron: number;
}>;

export type TerrainDecorationBudget = Readonly<{
  maximumPoints: number;
  preserveRadius?: number;
  playableKeys?: ReadonlySet<string>;
}>;

const CENTER_COORD = { q: 0, r: 0 } as const;
const STRUCTURE_CLEARANCE = 0.08;

function candidatePoint(cell: TerrainCell, hexSize: number): HexWorldPosition {
  const center = axialToWorld(cell.coord, hexSize);
  const angle = seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'stone-angle')) * Math.PI * 2;
  const radial = Math.sqrt(seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'stone-radius')))
    * hexSize * 0.58;
  return Object.freeze({
    x: center.x + Math.cos(angle) * radial,
    z: center.z + Math.sin(angle) * radial
  });
}

function createPoint(
  cell: TerrainCell,
  hexSize: number,
  apron: boolean,
  placements: readonly TerrainStructurePlacement[]
): TerrainDecorationPoint | null {
  const world = candidatePoint(cell, hexSize);
  const center = axialToWorld(cell.coord, hexSize);
  const local = { x: world.x - center.x, z: world.z - center.z };
  if (pointyHexBoundaryDistance(local, hexSize) > 0.72) return null;
  if (!isPlacementClear(placements, world, hexSize, STRUCTURE_CLEARANCE)) return null;
  return Object.freeze({
    kind: 'stone',
    coord: Object.freeze({ q: cell.coord.q, r: cell.coord.r }),
    world,
    rotation: seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'stone-rotation')) * Math.PI * 2,
    scale: 0.72 + seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'stone-scale')) * 0.62,
    apron
  });
}

/**
 * Static stones retain their existing bounded generic-detail family. Grass is
 * intentionally absent here: its camera-local generator never scans the whole
 * render map and owns a separate quality plan.
 */
export function generateTerrainDecorations(
  renderMap: RealmTerrainMap,
  quality: TerrainDecorationQuality,
  hexSize = 1,
  placements: readonly TerrainStructurePlacement[] = EMPTY_TERRAIN_PLACEMENTS,
  terrainKindsByKey?: ReadonlyMap<string, RealmTerrainKind>,
  budget?: TerrainDecorationBudget
): TerrainDecorationData {
  const maximumPoints = budget === undefined
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Number.isFinite(budget.maximumPoints) ? Math.trunc(budget.maximumPoints) : 0);
  const preserveRadius = Math.max(0, Number.isFinite(budget?.preserveRadius)
    ? Math.trunc(budget!.preserveRadius!)
    : 20);
  const candidates = createDeterministicBudgetCollector<Readonly<{ cell: TerrainCell; apron: boolean }>>(
    maximumPoints
  );
  let order = 0;
  [...renderMap.cells]
    .sort((left, right) => left.coord.q - right.coord.q || left.coord.r - right.coord.r)
    .forEach((cell) => {
      const key = hexKey(cell.coord);
      const terrainKind = terrainKindsByKey?.get(key);
      if (terrainKind === 'lake' || terrainKind === 'ridge' || terrainKind === 'ancient-stone') return;
      const apron = budget?.playableKeys !== undefined
        ? !budget.playableKeys.has(key)
        : hexDistance(CENTER_COORD, cell.coord) > quality.playableRadius;
      const chance = apron ? quality.stoneChanceApron : quality.stoneChancePlayable;
      const signal = seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'stone-presence'));
      if (signal >= chance * (0.82 + Math.max(-0.3, cell.rockBias * 0.22))) return;
      candidates.add({
        value: Object.freeze({ cell, apron }),
        group: hexDistance(CENTER_COORD, cell.coord) <= preserveRadius ? 0 : 1,
        rank: deriveChannelSeed(cell.seed, 0, 0, 'stone-detail-budget'),
        order: order++
      });
    });
  const localPlacementsByCell = new Map<string, readonly TerrainStructurePlacement[]>();
  const points = candidates.values().flatMap(({ cell, apron }) => {
    const key = hexKey(cell.coord);
    let localPlacements = localPlacementsByCell.get(key);
    if (!localPlacements) {
      localPlacements = terrainPlacementsForCell(placements, cell.coord, hexSize, STRUCTURE_CLEARANCE);
      localPlacementsByCell.set(key, localPlacements);
    }
    const point = createPoint(cell, hexSize, apron, localPlacements);
    return point ? [point] : [];
  });
  return Object.freeze({
    points: Object.freeze(points),
    counts: Object.freeze({ stone: points.length })
  });
}
