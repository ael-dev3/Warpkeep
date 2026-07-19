import {
  axialToWorld,
  hexDisc,
  hexDistance,
  hexKey,
  hexNeighbors,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import {
  realmForestCanopyMinimumSeparation,
  REALM_FOREST_TREE_MINIMUM_SEPARATION,
  type RealmForestBiomeCounts,
  type RealmForestBiomeData,
  type RealmForestBiomeQuality,
  type RealmForestSpecies,
  type RealmForestTreePoint
} from './realmForestBiomes';
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
import type { RealmVegetationField } from './realmVegetationField';

export type RealmForestInfillData = RealmForestBiomeData & Readonly<{
  source: 'decorative-infill';
  clusterCount: number;
  anchorTileKeys: readonly string[];
}>;

export type GenerateRealmForestInfillOptions = Readonly<{
  quality: RealmForestBiomeQuality;
  species: readonly RealmForestSpecies[];
  vegetationField: RealmVegetationField;
  playableKeys: ReadonlySet<string>;
  authoritativeTrees: readonly RealmForestTreePoint[];
  placements?: readonly TerrainStructurePlacement[];
  isWorldExcluded?: (world: HexWorldPosition) => boolean;
  isCoordPassable?: (coord: HexCoord) => boolean;
  preserveRadius?: number;
  hexSize?: number;
  maximumInstanceCount?: number;
  maximumTriangleCount?: number;
  visualizeLegacyLakesAsLand?: boolean;
}>;

export const REALM_FOREST_INFILL_BUDGETS: Readonly<Record<
  RealmForestBiomeQuality,
  Readonly<{ instances: number; triangles: number; anchors: number }>
>> = Object.freeze({
  high: Object.freeze({ instances: 240, triangles: 56_000, anchors: 18 }),
  balanced: Object.freeze({ instances: 90, triangles: 22_000, anchors: 9 }),
  reduced: Object.freeze({ instances: 0, triangles: 0, anchors: 0 })
});

type ForestAnchor = Readonly<{
  cell: TerrainCell;
  key: string;
  potential: number;
  wetness: number;
}>;

const TREE_STRUCTURE_CLEARANCE = 0.14;
const TREE_LOCAL_RADIUS = 0.52;
const MINIMUM_ANCHOR_SPACING = 5;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function foliageTerrain(kind: RealmTerrainKind | undefined, visualizeLegacyLakesAsLand = false) {
  return kind === 'forest'
    || kind === 'lowland'
    || kind === 'meadow'
    || (visualizeLegacyLakesAsLand && kind === 'lake');
}

function passable(
  coord: HexCoord,
  predicate: GenerateRealmForestInfillOptions['isCoordPassable']
) {
  if (!predicate) return true;
  try {
    return predicate(coord) === true;
  } catch {
    return false;
  }
}

function presentationPassable(
  coord: HexCoord,
  kind: RealmTerrainKind | undefined,
  options: GenerateRealmForestInfillOptions
) {
  return options.visualizeLegacyLakesAsLand === true && kind === 'lake'
    ? true
    : passable(coord, options.isCoordPassable);
}

function validSpecies(species: readonly RealmForestSpecies[]) {
  const byId = new Map<string, RealmForestSpecies>();
  species.forEach((candidate) => {
    if (
      typeof candidate.id !== 'string'
      || candidate.id.length === 0
      || byId.has(candidate.id)
      || !Number.isSafeInteger(candidate.triangles)
      || candidate.triangles <= 0
    ) return;
    byId.set(candidate.id, candidate);
  });
  return Object.freeze([...byId.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function normalizedBudget(
  quality: RealmForestBiomeQuality,
  maximumInstances: number | undefined,
  maximumTriangles: number | undefined
) {
  const defaults = REALM_FOREST_INFILL_BUDGETS[quality];
  const instances = Number.isSafeInteger(maximumInstances)
    ? clamp(maximumInstances!, 0, defaults.instances)
    : defaults.instances;
  const triangles = Number.isSafeInteger(maximumTriangles)
    ? clamp(maximumTriangles!, 0, defaults.triangles)
    : defaults.triangles;
  return Object.freeze({ instances, triangles, anchors: defaults.anchors });
}

function sectorFor(world: HexWorldPosition) {
  const normalized = (Math.atan2(world.z, world.x) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(5, Math.floor(normalized / (Math.PI / 3)));
}

function createForestAnchors(
  map: RealmTerrainMap,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  options: GenerateRealmForestInfillOptions,
  targetCount: number,
  preserveRadius: number,
  hexSize: number
) {
  if (targetCount <= 0) return Object.freeze([] as ForestAnchor[]);
  const expansionWidth = Math.max(1, map.radius - preserveRadius);
  const strata = new Map<string, ForestAnchor[]>();
  map.cells.forEach((cell) => {
    const key = hexKey(cell.coord);
    const ring = hexDistance({ q: 0, r: 0 }, cell.coord);
    const terrainKind = terrainKindsByKey.get(key);
    if (
      ring <= preserveRadius
      || !options.playableKeys.has(key)
      || !foliageTerrain(
        terrainKind,
        options.visualizeLegacyLakesAsLand === true
      )
      || !presentationPassable(cell.coord, terrainKind, options)
    ) return;
    const vegetation = options.vegetationField.sampleCell(cell.coord);
    if (vegetation.woodlandPotential < 0.43) return;
    const band = Math.min(2, Math.floor(((ring - preserveRadius - 1) / expansionWidth) * 3));
    const sector = sectorFor(axialToWorld(cell.coord, hexSize));
    const candidate = Object.freeze({
      cell,
      key,
      potential: vegetation.woodlandPotential,
      wetness: vegetation.wetness
    });
    const stratumKey = `${band}:${sector}`;
    const bucket = strata.get(stratumKey);
    if (bucket) bucket.push(candidate);
    else strata.set(stratumKey, [candidate]);
  });

  const winners = [...strata].flatMap(([stratum, bucket]) => (
    [...bucket].sort((left, right) => {
      const leftKind = terrainKindsByKey.get(left.key);
      const rightKind = terrainKindsByKey.get(right.key);
      const leftScore = left.potential
        + Number(leftKind === 'forest') * 0.08
        + seededUnitFloat(deriveChannelSeed(left.cell.seed, 0, 0, `forest-infill-anchor:${stratum}`)) * 0.08;
      const rightScore = right.potential
        + Number(rightKind === 'forest') * 0.08
        + seededUnitFloat(deriveChannelSeed(right.cell.seed, 0, 0, `forest-infill-anchor:${stratum}`)) * 0.08;
      return rightScore - leftScore
        || left.cell.coord.q - right.cell.coord.q
        || left.cell.coord.r - right.cell.coord.r;
    }).slice(0, 2)
  )).sort((left, right) => (
    right.potential - left.potential
    || deriveChannelSeed(left.cell.seed, 0, 0, 'forest-infill-anchor-order')
      - deriveChannelSeed(right.cell.seed, 0, 0, 'forest-infill-anchor-order')
    || left.cell.coord.q - right.cell.coord.q
    || left.cell.coord.r - right.cell.coord.r
  ));

  const anchors: ForestAnchor[] = [];
  const admitAtSpacing = (spacing: number) => {
    winners.forEach((candidate) => {
      if (anchors.length >= targetCount || anchors.includes(candidate)) return;
      if (anchors.some((anchor) => hexDistance(anchor.cell.coord, candidate.cell.coord) < spacing)) return;
      anchors.push(candidate);
    });
  };
  admitAtSpacing(MINIMUM_ANCHOR_SPACING);
  if (anchors.length < targetCount) admitAtSpacing(3);
  return Object.freeze(anchors.slice(0, targetCount).sort((left, right) => (
    left.cell.coord.q - right.cell.coord.q || left.cell.coord.r - right.cell.coord.r
  )));
}

function hasTag(species: RealmForestSpecies, tag: string) {
  return species.biomes?.some((biome) => biome.toLowerCase() === tag) === true;
}

function grovePalette(
  species: readonly RealmForestSpecies[],
  anchor: ForestAnchor,
  terrainKind: RealmTerrainKind | undefined
) {
  const tags = anchor.wetness >= 0.68
    ? ['wetland', 'river']
    : terrainKind === 'forest' || anchor.potential >= 0.76
      ? ['forest', 'coniferous']
      : ['deciduous', 'meadow'];
  const preferred = species.filter((candidate) => tags.some((tag) => hasTag(candidate, tag)));
  const pool = preferred.length > 0 ? preferred : species;
  const firstIndex = Math.floor(seededUnitFloat(
    deriveChannelSeed(anchor.cell.seed, 0, 0, 'forest-infill-primary-species')
  ) * pool.length);
  const primary = pool[Math.min(pool.length - 1, firstIndex)]!;
  if (pool.length === 1) return Object.freeze([primary]);
  const secondaryOffset = 1 + Math.floor(seededUnitFloat(
    deriveChannelSeed(anchor.cell.seed, 0, 0, 'forest-infill-secondary-species')
  ) * (pool.length - 1));
  return Object.freeze([primary, pool[(firstIndex + secondaryOffset) % pool.length]!]);
}

function footprintDiameter(species: RealmForestSpecies) {
  return Number.isFinite(species.footprintDiameter) && species.footprintDiameter! > 0
    ? species.footprintDiameter!
    : 0.46;
}

function canFit(
  candidate: RealmForestTreePoint,
  existing: readonly RealmForestTreePoint[],
  hexSize: number
) {
  return existing.every((tree) => {
    const minimum = Math.max(
      REALM_FOREST_TREE_MINIMUM_SEPARATION,
      realmForestCanopyMinimumSeparation(candidate, tree)
    ) * hexSize;
    return Math.hypot(
      candidate.world.x - tree.world.x,
      candidate.world.z - tree.world.z
    ) >= minimum;
  });
}

function candidatePoint(
  cell: TerrainCell,
  localIndex: number,
  palette: readonly RealmForestSpecies[],
  potential: number,
  hexSize: number,
  placements: readonly TerrainStructurePlacement[],
  isWorldExcluded: GenerateRealmForestInfillOptions['isWorldExcluded'],
  existing: readonly RealmForestTreePoint[]
) {
  const center = axialToWorld(cell.coord, hexSize);
  const localPlacements = terrainPlacementsForCell(
    placements,
    cell.coord,
    hexSize,
    TREE_STRUCTURE_CLEARANCE
  );
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const angle = seededUnitFloat(
      deriveChannelSeed(cell.seed, localIndex, attempt, 'forest-infill-angle')
    ) * Math.PI * 2;
    const radius = Math.sqrt(seededUnitFloat(
      deriveChannelSeed(cell.seed, localIndex, attempt, 'forest-infill-radius')
    )) * TREE_LOCAL_RADIUS * hexSize;
    const world = Object.freeze({
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius
    });
    if (pointyHexBoundaryDistance({ x: world.x - center.x, z: world.z - center.z }, hexSize) > 0.78) {
      continue;
    }
    if (!isPlacementClear(localPlacements, world, hexSize, TREE_STRUCTURE_CLEARANCE)) continue;
    if (isWorldExcluded?.(world) === true) continue;
    const secondary = palette.length > 1 && seededUnitFloat(
      deriveChannelSeed(cell.seed, localIndex, attempt, 'forest-infill-species-mix')
    ) >= 0.76;
    const species = palette[secondary ? 1 : 0]!;
    const point: RealmForestTreePoint = Object.freeze({
      speciesId: species.id,
      coord: Object.freeze({ ...cell.coord }),
      world,
      rotation: seededUnitFloat(
        deriveChannelSeed(cell.seed, localIndex, attempt, 'forest-infill-rotation')
      ) * Math.PI * 2,
      scale: 0.9 + seededUnitFloat(
        deriveChannelSeed(cell.seed, localIndex, attempt, 'forest-infill-scale')
      ) * 0.2,
      habitat: potential >= 0.76 ? 'grove' : potential >= 0.56 ? 'forest' : 'fringe',
      estimatedTriangles: species.triangles,
      footprintDiameter: footprintDiameter(species)
    });
    if (canFit(point, existing, hexSize)) return point;
  }
  return undefined;
}

function emptyCounts(
  map: RealmTerrainMap,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>
): RealmForestBiomeCounts {
  const forestSemanticCellCount = map.cells.filter((cell) => (
    terrainKindsByKey.get(hexKey(cell.coord)) === 'forest'
  )).length;
  return Object.freeze({
    forestSemanticCellCount,
    groveCellCount: 0,
    fringeCellCount: 0,
    eligibleFoliageCellCount: 0,
    openFoliageCellCount: 0,
    openCellCount: map.cells.length,
    treeCount: 0,
    speciesCount: 0,
    estimatedTriangleCount: 0
  });
}

/**
 * Add a bounded outer-Realm forest presentation around the immutable 210-tree
 * layout. Generated points are a separate decorative layer and never enter a
 * public table, snapshot, movement rule, resource rule, or interaction ray.
 */
export function generateRealmForestInfill(
  map: RealmTerrainMap,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  options: GenerateRealmForestInfillOptions
): RealmForestInfillData {
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0
    ? options.hexSize!
    : 1;
  const preserveRadius = Number.isSafeInteger(options.preserveRadius)
    ? clamp(options.preserveRadius!, 0, map.radius)
    : 20;
  const budget = normalizedBudget(
    options.quality,
    options.maximumInstanceCount,
    options.maximumTriangleCount
  );
  const species = validSpecies(options.species);
  const empty = (): RealmForestInfillData => Object.freeze({
    source: 'decorative-infill',
    points: Object.freeze([]),
    canopyByTileKey: new Map(),
    counts: emptyCounts(map, terrainKindsByKey),
    instanceBudget: budget.instances,
    triangleBudget: budget.triangles,
    clusterCount: 0,
    anchorTileKeys: Object.freeze([])
  });
  if (budget.instances === 0 || budget.triangles === 0 || species.length === 0) return empty();

  const anchors = createForestAnchors(
    map,
    terrainKindsByKey,
    options,
    budget.anchors,
    preserveRadius,
    hexSize
  );
  if (anchors.length === 0) return empty();
  const cellsByKey = new Map(map.cells.map((cell) => [hexKey(cell.coord), cell] as const));
  const placements = options.placements ?? EMPTY_TERRAIN_PLACEMENTS;
  const accepted: RealmForestTreePoint[] = [];
  let triangles = 0;
  const acceptedClusterKeys: string[] = [];
  const perClusterLimit = Math.max(6, Math.ceil(budget.instances / anchors.length));

  anchors.forEach((anchor) => {
    if (accepted.length >= budget.instances) return;
    const palette = grovePalette(species, anchor, terrainKindsByKey.get(anchor.key));
    const radius = options.quality === 'high'
      ? 2 + Number(seededUnitFloat(
        deriveChannelSeed(anchor.cell.seed, 0, 0, 'forest-infill-cluster-radius')
      ) > 0.56)
      : 2;
    const clusterCells = hexDisc(anchor.cell.coord, radius)
      .flatMap((coord) => {
        const cell = cellsByKey.get(hexKey(coord));
        if (!cell) return [];
        const key = hexKey(cell.coord);
        const terrainKind = terrainKindsByKey.get(key);
        if (
          hexDistance({ q: 0, r: 0 }, cell.coord) <= preserveRadius
          || !options.playableKeys.has(key)
          || !foliageTerrain(
            terrainKind,
            options.visualizeLegacyLakesAsLand === true
          )
          || !presentationPassable(cell.coord, terrainKind, options)
        ) return [];
        const vegetation = options.vegetationField.sampleCell(cell.coord);
        return vegetation.woodlandPotential >= 0.34
          ? [{ cell, vegetation }]
          : [];
      })
      .sort((left, right) => (
        hexDistance(anchor.cell.coord, left.cell.coord)
          - hexDistance(anchor.cell.coord, right.cell.coord)
        || right.vegetation.woodlandPotential - left.vegetation.woodlandPotential
        || deriveChannelSeed(left.cell.seed, 0, 0, 'forest-infill-cell-order')
          - deriveChannelSeed(right.cell.seed, 0, 0, 'forest-infill-cell-order')
      ));
    const provisional: RealmForestTreePoint[] = [];
    for (let pass = 0; pass < 2 && provisional.length < perClusterLimit; pass += 1) {
      clusterCells.forEach(({ cell, vegetation }) => {
        if (
          provisional.length >= perClusterLimit
          || accepted.length + provisional.length >= budget.instances
        ) return;
        const point = candidatePoint(
          cell,
          pass,
          palette,
          vegetation.woodlandPotential,
          hexSize,
          placements,
          options.isWorldExcluded,
          [...options.authoritativeTrees, ...accepted, ...provisional]
        );
        if (!point || triangles + provisional.reduce(
          (total, candidate) => total + candidate.estimatedTriangles,
          0
        ) + point.estimatedTriangles > budget.triangles) return;
        provisional.push(point);
      });
    }
    const provisionalTreeKeys = new Set(provisional.map((point) => hexKey(point.coord)));
    const connected = provisional.filter((point) => {
      const cell = cellsByKey.get(hexKey(point.coord));
      return cell && hexNeighbors(cell.coord).some((neighbor) => (
        provisionalTreeKeys.has(hexKey(neighbor))
      ));
    });
    const treeKeys = new Set(connected.map((point) => hexKey(point.coord)));
    const hasConnectedCells = [...treeKeys].some((key) => {
      const cell = cellsByKey.get(key);
      return cell && hexNeighbors(cell.coord).some((neighbor) => treeKeys.has(hexKey(neighbor)));
    });
    if (!hasConnectedCells || treeKeys.size < 2 || connected.length < 5) return;
    accepted.push(...connected);
    triangles += connected.reduce((total, point) => total + point.estimatedTriangles, 0);
    acceptedClusterKeys.push(anchor.key);
  });

  const canopyByTileKey = new Map<string, number>();
  const treeCountByKey = new Map<string, number>();
  accepted.forEach((point) => {
    const key = hexKey(point.coord);
    treeCountByKey.set(key, (treeCountByKey.get(key) ?? 0) + 1);
  });
  treeCountByKey.forEach((count, key) => {
    canopyByTileKey.set(key, clamp(0.48 + count * 0.2, 0, 1));
    const cell = cellsByKey.get(key);
    cell && hexNeighbors(cell.coord).forEach((neighbor) => {
      const neighborKey = hexKey(neighbor);
      if (!options.playableKeys.has(neighborKey)) return;
      canopyByTileKey.set(neighborKey, Math.max(canopyByTileKey.get(neighborKey) ?? 0, 0.2));
    });
  });
  const groveKeys = new Set(accepted
    .filter((point) => point.habitat === 'grove')
    .map((point) => hexKey(point.coord)));
  const fringeKeys = new Set(accepted
    .filter((point) => point.habitat === 'fringe')
    .map((point) => hexKey(point.coord)));
  let eligibleFoliageCellCount = 0;
  map.cells.forEach((cell) => {
    const key = hexKey(cell.coord);
    const terrainKind = terrainKindsByKey.get(key);
    if (
      options.playableKeys.has(key)
      && foliageTerrain(
        terrainKind,
        options.visualizeLegacyLakesAsLand === true
      )
      && presentationPassable(cell.coord, terrainKind, options)
    ) eligibleFoliageCellCount += 1;
  });
  const treeCellCount = treeCountByKey.size;
  const counts: RealmForestBiomeCounts = Object.freeze({
    forestSemanticCellCount: map.cells.filter((cell) => (
      terrainKindsByKey.get(hexKey(cell.coord)) === 'forest'
    )).length,
    groveCellCount: groveKeys.size,
    fringeCellCount: fringeKeys.size,
    eligibleFoliageCellCount,
    openFoliageCellCount: Math.max(0, eligibleFoliageCellCount - treeCellCount),
    openCellCount: Math.max(0, map.cells.length - treeCellCount),
    treeCount: accepted.length,
    speciesCount: new Set(accepted.map((point) => point.speciesId)).size,
    estimatedTriangleCount: triangles
  });
  return Object.freeze({
    source: 'decorative-infill',
    points: Object.freeze(accepted),
    canopyByTileKey,
    counts,
    instanceBudget: budget.instances,
    triangleBudget: budget.triangles,
    clusterCount: acceptedClusterKeys.length,
    anchorTileKeys: Object.freeze(acceptedClusterKeys)
  });
}
