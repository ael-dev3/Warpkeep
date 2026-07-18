import {
  axialToWorld,
  hexDistance,
  hexKey,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import { deriveChannelSeed, seededUnitFloat } from './realmSeed';
import type { RealmTerrainKind } from './realmTerrainSemantics';
import { pointyHexBoundaryDistance } from './terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  isPlacementClear,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from './terrainPlacements';
import { createDeterministicBudgetCollector } from './deterministicBudget';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

export type TerrainDecorationKind = 'green-tuft' | 'dry-tuft' | 'stone';

export type TerrainDecorationPoint = Readonly<{
  kind: TerrainDecorationKind;
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

/** Renderer-neutral density slice accepted from any visual quality profile. */
export type TerrainDecorationQuality = Readonly<{
  playableRadius: number;
  greenTuftsPerPlayableCell: number;
  greenTuftsPerApronCell: number;
  dryTuftsPerPlayableCell: number;
  dryTuftsPerApronCell: number;
  stoneChancePlayable: number;
  stoneChanceApron: number;
}>;

export type TerrainDecorationBudget = Readonly<{
  maximumPoints: number;
  /** Keep the established founding realm visually stable before filling expansion cells. */
  preserveRadius?: number;
  /** Exact authority set for partial perimeter rings; absent keys are visual apron. */
  playableKeys?: ReadonlySet<string>;
}>;

const CENTER_COORD = { q: 0, r: 0 } as const;
const MAX_LOCAL_RADIUS = 0.61;
const STRUCTURE_CLEARANCE = 0.08;

function candidatePoint(
  cell: TerrainCell,
  kind: TerrainDecorationKind,
  index: number,
  hexSize: number,
  attempt: number
): HexWorldPosition {
  const center = axialToWorld(cell.coord, hexSize);
  const angle = seededUnitFloat(deriveChannelSeed(cell.seed, index, attempt, `${kind}-angle`)) * Math.PI * 2;
  const radial = Math.sqrt(seededUnitFloat(
    deriveChannelSeed(cell.seed, index, attempt, `${kind}-radius`)
  )) * MAX_LOCAL_RADIUS * hexSize;
  return {
    x: center.x + Math.cos(angle) * radial,
    z: center.z + Math.sin(angle) * radial
  };
}

function createPoint(
  cell: TerrainCell,
  kind: TerrainDecorationKind,
  index: number,
  hexSize: number,
  apron: boolean,
  placements: readonly TerrainStructurePlacement[]
): TerrainDecorationPoint | null {
  const center = axialToWorld(cell.coord, hexSize);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const world = candidatePoint(cell, kind, index, hexSize, attempt);
    const local = { x: world.x - center.x, z: world.z - center.z };
    if (pointyHexBoundaryDistance(local, hexSize) > 0.74) continue;
    if (!isPlacementClear(placements, world, hexSize, STRUCTURE_CLEARANCE)) continue;
    return {
      kind,
      coord: cell.coord,
      world,
      rotation: seededUnitFloat(deriveChannelSeed(cell.seed, index, attempt, `${kind}-rotation`)) * Math.PI * 2,
      scale: 0.72 + seededUnitFloat(deriveChannelSeed(cell.seed, index, attempt, `${kind}-scale`)) * 0.62,
      apron
    };
  }
  return null;
}

type TerrainDecorationCandidate = Readonly<{
  cell: TerrainCell;
  kind: TerrainDecorationKind;
  index: number;
  apron: boolean;
}>;

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
    : Math.max(0, Number.isFinite(budget.maximumPoints)
      ? Math.trunc(budget.maximumPoints)
      : 0);
  const preserveRadius = Math.max(0, Number.isFinite(budget?.preserveRadius)
    ? Math.trunc(budget!.preserveRadius!)
    : 20);
  const candidates = createDeterministicBudgetCollector<TerrainDecorationCandidate>(
    maximumPoints
  );
  let order = 0;

  const offerKind = (
    cell: TerrainCell,
    kind: TerrainDecorationKind,
    count: number,
    apron: boolean
  ) => {
    for (let index = 0; index < count; index += 1) {
      candidates.add({
        value: { cell, kind, index, apron },
        group: hexDistance(CENTER_COORD, cell.coord) <= preserveRadius ? 0 : 1,
        rank: deriveChannelSeed(cell.seed, index, 0, `${kind}-detail-budget`),
        order
      });
      order += 1;
    }
  };

  renderMap.cells.forEach((cell) => {
    const tileKey = hexKey(cell.coord);
    const terrainKind = terrainKindsByKey?.get(tileKey);
    if (
      terrainKind === 'ridge'
      || terrainKind === 'lake'
      || terrainKind === 'ancient-stone'
    ) return;
    const apron = budget?.playableKeys !== undefined
      ? !budget.playableKeys.has(tileKey)
      : hexDistance(CENTER_COORD, cell.coord) > quality.playableRadius;
    offerKind(
      cell,
      'green-tuft',
      apron ? quality.greenTuftsPerApronCell : quality.greenTuftsPerPlayableCell,
      apron
    );
    offerKind(
      cell,
      'dry-tuft',
      apron ? quality.dryTuftsPerApronCell : quality.dryTuftsPerPlayableCell,
      apron
    );

    const chance = apron ? quality.stoneChanceApron : quality.stoneChancePlayable;
    const stoneSignal = seededUnitFloat(deriveChannelSeed(cell.seed, 0, 0, 'stone-presence'));
    const biasedChance = chance * (0.82 + Math.max(-0.3, cell.rockBias * 0.22));
    if (stoneSignal < biasedChance) {
      offerKind(cell, 'stone', 1, apron);
    }
  });

  const localPlacementsByCell = new Map<string, readonly TerrainStructurePlacement[]>();
  const points = candidates.values().flatMap((candidate) => {
    const key = hexKey(candidate.cell.coord);
    let localPlacements = localPlacementsByCell.get(key);
    if (!localPlacements) {
      localPlacements = terrainPlacementsForCell(
        placements,
        candidate.cell.coord,
        hexSize,
        STRUCTURE_CLEARANCE
      );
      localPlacementsByCell.set(key, localPlacements);
    }
    const point = createPoint(
      candidate.cell,
      candidate.kind,
      candidate.index,
      hexSize,
      candidate.apron,
      localPlacements
    );
    return point ? [point] : [];
  });

  return {
    points,
    counts: {
      'green-tuft': points.filter((point) => point.kind === 'green-tuft').length,
      'dry-tuft': points.filter((point) => point.kind === 'dry-tuft').length,
      stone: points.filter((point) => point.kind === 'stone').length
    }
  };
}
