import {
  axialToWorld,
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
import type { TerrainCell } from './terrainTypes';
import type { RealmVegetationFieldSample } from './realmVegetationField';
import type { RealmForestSpecies, RealmForestTreePoint } from './realmForestBiomes';

/** Bump this when the visual ecology channels change. It is not world state. */
export const REALM_FOREST_ECOLOGY_VERSION = 'dense-forest-ecology-v1';

export type RealmForestEcologyQuality = 'high' | 'balanced' | 'reduced';
export type RealmForestEcologyHabitat = 'grove' | 'forest' | 'fringe';

export type RealmForestEcologyCandidate = Readonly<{
  cellKey: string;
  speciesId: string;
  coord: HexCoord;
  world: HexWorldPosition;
  rotation: number;
  scale: number;
  habitat: RealmForestEcologyHabitat;
  rank: number;
  footprintDiameter: number;
  estimatedTriangles: number;
  canopyContribution: number;
}>;

export type RealmForestCellEcology = Readonly<{
  cellKey: string;
  coord: HexCoord;
  terrainKind: RealmTerrainKind;
  canopyContribution: number;
  candidates: readonly RealmForestEcologyCandidate[];
}>;

export type GenerateRealmForestCellEcologyOptions = Readonly<{
  worldSeed: number;
  quality: RealmForestEcologyQuality;
  species: readonly RealmForestSpecies[];
  vegetation: RealmVegetationFieldSample;
  terrainKind: RealmTerrainKind;
  playable: boolean;
  hexSize?: number;
  placements?: readonly TerrainStructurePlacement[];
  authoritativeTrees?: readonly RealmForestTreePoint[];
  isWorldExcluded?: (world: HexWorldPosition) => boolean;
  isCoordPassable?: (coord: HexCoord) => boolean;
}>;

const TREE_CLEARANCE = 0.13;
const CELL_RADIUS = 0.53;
const DEFAULT_FOOTPRINT = 0.27;

const QUALITY_DENSITY: Readonly<Record<RealmForestEcologyQuality, Readonly<{
  forest: number;
  lowland: number;
  meadow: number;
}>>> = Object.freeze({
  high: Object.freeze({ forest: 9, lowland: 3, meadow: 2 }),
  balanced: Object.freeze({ forest: 5, lowland: 2, meadow: 1 }),
  reduced: Object.freeze({ forest: 2, lowland: 1, meadow: 0 })
});

export const REALM_FOREST_ECOLOGY_MAX_CANDIDATES_PER_CELL:
  Readonly<Record<RealmForestEcologyQuality, number>> = Object.freeze({
  high: QUALITY_DENSITY.high.forest,
  balanced: QUALITY_DENSITY.balanced.forest,
  reduced: QUALITY_DENSITY.reduced.forest
});
export const REALM_FOREST_ECOLOGY_PALETTE_LIMIT = 5;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function validSpecies(species: readonly RealmForestSpecies[]) {
  return [...species]
    .filter((candidate) => candidate.id.length > 0 && candidate.triangles > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * One world-stable palette bounds loaders and draw calls while retaining a
 * deliberate mix of wet, evergreen, and deciduous silhouettes. Selection is
 * seed-ranked and input-order independent; it is presentation, never ecology
 * authority or persistent state.
 */
export function selectRealmForestEcologySpeciesPalette(
  species: readonly RealmForestSpecies[],
  worldSeed: number,
  limitInput = REALM_FOREST_ECOLOGY_PALETTE_LIMIT
) {
  const limit = Math.min(
    REALM_FOREST_ECOLOGY_PALETTE_LIMIT,
    Math.max(0, Math.trunc(Number.isFinite(limitInput) ? limitInput : 0))
  );
  const ranked = validSpecies(species)
    .map((candidate) => Object.freeze({
      candidate,
      rank: seededUnitFloat(deriveChannelSeed(
        worldSeed,
        0,
        0,
        `${REALM_FOREST_ECOLOGY_VERSION}:palette:${candidate.id}`
      ))
    }))
    .sort((left, right) => right.rank - left.rank
      || left.candidate.id.localeCompare(right.candidate.id));
  if (limit === 0) return Object.freeze([]);
  const selected: RealmForestSpecies[] = [];
  const take = (
    predicate: (candidate: RealmForestSpecies) => boolean,
    count: number
  ) => {
    let added = 0;
    ranked.forEach(({ candidate }) => {
      if (
        selected.length >= limit
        || added >= count
        || selected.includes(candidate)
        || !predicate(candidate)
      ) return;
      selected.push(candidate);
      added += 1;
    });
  };
  take((candidate) => (
    hasTag(candidate, 'wetland') || hasTag(candidate, 'river')
  ), 1);
  take((candidate) => hasTag(candidate, 'coniferous'), 2);
  take((candidate) => hasTag(candidate, 'deciduous'), 2);
  ranked.forEach(({ candidate }) => {
    if (selected.length < limit && !selected.includes(candidate)) selected.push(candidate);
  });
  return Object.freeze(selected.slice(0, limit));
}

function hasTag(species: RealmForestSpecies, tag: string) {
  return species.biomes?.some((biome) => biome.toLowerCase() === tag) === true;
}

function paletteFor(
  species: readonly RealmForestSpecies[],
  terrainKind: RealmTerrainKind,
  vegetation: RealmVegetationFieldSample
) {
  const tags = vegetation.wetness > 0.66
    ? ['wetland', 'river', 'boreal']
    : terrainKind === 'forest' || vegetation.woodlandPotential > 0.72
      ? ['coniferous', 'boreal', 'forest']
      : ['deciduous', 'temperate', 'meadow'];
  const preferred = species.filter((candidate) => tags.some((tag) => hasTag(candidate, tag)));
  const pool = preferred.length > 0 ? preferred : species;
  return pool.slice(0, Math.min(5, pool.length));
}

function candidateCount(
  quality: RealmForestEcologyQuality,
  terrainKind: RealmTerrainKind,
  vegetation: RealmVegetationFieldSample,
  seed: number
) {
  const density = QUALITY_DENSITY[quality];
  const base = terrainKind === 'forest'
    ? density.forest
    : terrainKind === 'lowland'
      ? (vegetation.woodlandPotential > 0.4 ? density.lowland : 0)
      : terrainKind === 'meadow'
        ? (vegetation.forestNeighbourShare > 0.18 && vegetation.woodlandPotential > 0.25
          ? density.meadow : 0)
        : 0;
  if (base <= 0) return 0;
  // A stable, cell-local clearing signal prevents a regular one-tree-per-cell grid.
  const clearing = seededUnitFloat(deriveChannelSeed(seed, 0, 0, `${REALM_FOREST_ECOLOGY_VERSION}:clearing`));
  const retained = clearing < (terrainKind === 'forest' ? 0.13 : 0.26) ? 0.48 : 1;
  const jitter = seededUnitFloat(deriveChannelSeed(seed, 0, 0, `${REALM_FOREST_ECOLOGY_VERSION}:density`));
  return Math.max(0, Math.floor(base * retained + jitter * 0.8));
}

function worldForCell(cell: TerrainCell, index: number, attempt: number, hexSize: number) {
  const center = axialToWorld(cell.coord, hexSize);
  const angle = seededUnitFloat(deriveChannelSeed(
    cell.seed, index, attempt, `${REALM_FOREST_ECOLOGY_VERSION}:angle`
  )) * Math.PI * 2;
  const radius = Math.sqrt(seededUnitFloat(deriveChannelSeed(
    cell.seed, index, attempt, `${REALM_FOREST_ECOLOGY_VERSION}:radius`
  ))) * CELL_RADIUS * hexSize;
  return Object.freeze({
    x: center.x + Math.cos(angle) * radius,
    z: center.z + Math.sin(angle) * radius
  });
}

/** Generate one immutable cell only. The active-window layer calls this lazily. */
export function generateRealmForestCellEcology(
  cell: TerrainCell,
  options: GenerateRealmForestCellEcologyOptions
): RealmForestCellEcology {
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0 ? options.hexSize! : 1;
  const cellKey = hexKey(cell.coord);
  // Re-key each cell through the explicit public world seed. The terrain cell
  // seed remains an input, but candidate identity is visibly scoped to this
  // versioned ecology channel rather than to object iteration order.
  const ecologyCell = Object.freeze({
    ...cell,
    seed: deriveChannelSeed(options.worldSeed, cell.coord.q, cell.coord.r, REALM_FOREST_ECOLOGY_VERSION, cell.seed)
  });
  const canopyContribution = options.playable && (
    options.terrainKind === 'forest' || options.terrainKind === 'lowland' || options.terrainKind === 'meadow'
  )
    ? clamp(options.vegetation.woodlandPotential * 0.76 + options.vegetation.forestNeighbourShare * 0.24)
    : 0;
  let passable = true;
  try {
    passable = options.isCoordPassable?.(cell.coord) !== false;
  } catch {
    passable = false;
  }
  if (!options.playable || canopyContribution <= 0.08 || !passable) {
    return Object.freeze({ cellKey, coord: Object.freeze({ ...cell.coord }), terrainKind: options.terrainKind, canopyContribution, candidates: Object.freeze([]) });
  }
  const species = paletteFor(validSpecies(options.species), options.terrainKind, options.vegetation);
  if (species.length === 0) {
    return Object.freeze({ cellKey, coord: Object.freeze({ ...cell.coord }), terrainKind: options.terrainKind, canopyContribution, candidates: Object.freeze([]) });
  }
  const count = candidateCount(options.quality, options.terrainKind, options.vegetation, ecologyCell.seed);
  const placements = options.placements ?? EMPTY_TERRAIN_PLACEMENTS;
  const localPlacements = terrainPlacementsForCell(placements, cell.coord, hexSize, TREE_CLEARANCE);
  const canonical = options.authoritativeTrees ?? [];
  const candidates: RealmForestEcologyCandidate[] = [];
  for (let index = 0; index < count; index += 1) {
    let selected: RealmForestEcologyCandidate | undefined;
    for (let attempt = 0; attempt < 10 && !selected; attempt += 1) {
      const world = worldForCell(ecologyCell, index, attempt, hexSize);
      const center = axialToWorld(cell.coord, hexSize);
      if (pointyHexBoundaryDistance({ x: world.x - center.x, z: world.z - center.z }, hexSize) > 0.79) continue;
      if (!isPlacementClear(localPlacements, world, hexSize, TREE_CLEARANCE)) continue;
      let worldExcluded = false;
      try {
        worldExcluded = options.isWorldExcluded?.(world) === true;
      } catch {
        worldExcluded = true;
      }
      if (worldExcluded) continue;
      if (canonical.some((tree) => Math.hypot(tree.world.x - world.x, tree.world.z - world.z) < 0.22 * hexSize)) continue;
      if (candidates.some((tree) => Math.hypot(tree.world.x - world.x, tree.world.z - world.z) < 0.18 * hexSize)) continue;
      const paletteIndex = Math.floor(seededUnitFloat(deriveChannelSeed(ecologyCell.seed, index, 0, `${REALM_FOREST_ECOLOGY_VERSION}:species`)) * species.length);
      const selectedSpecies = species[Math.min(species.length - 1, paletteIndex)]!;
      const habitat: RealmForestEcologyHabitat = options.terrainKind === 'forest'
        ? (canopyContribution > 0.68 ? 'grove' : 'forest')
        : 'fringe';
      selected = Object.freeze({
        cellKey,
        speciesId: selectedSpecies.id,
        coord: Object.freeze({ ...cell.coord }),
        world,
        rotation: seededUnitFloat(deriveChannelSeed(ecologyCell.seed, index, attempt, `${REALM_FOREST_ECOLOGY_VERSION}:rotation`)) * Math.PI * 2,
        scale: 0.9 + seededUnitFloat(deriveChannelSeed(ecologyCell.seed, index, attempt, `${REALM_FOREST_ECOLOGY_VERSION}:scale`)) * 0.2,
        habitat,
        rank: seededUnitFloat(deriveChannelSeed(ecologyCell.seed, index, attempt, `${REALM_FOREST_ECOLOGY_VERSION}:rank`)),
        footprintDiameter: Number.isFinite(selectedSpecies.footprintDiameter) && selectedSpecies.footprintDiameter! > 0
          ? selectedSpecies.footprintDiameter!
          : DEFAULT_FOOTPRINT,
        estimatedTriangles: selectedSpecies.triangles,
        canopyContribution
      });
    }
    if (selected) candidates.push(selected);
  }
  return Object.freeze({
    cellKey,
    coord: Object.freeze({ ...cell.coord }),
    terrainKind: options.terrainKind,
    canopyContribution,
    candidates: Object.freeze(candidates)
  });
}

/** Stable canopy potential for terrain color; independent of the active window. */
export function deriveRealmForestCanopyField(
  cells: readonly TerrainCell[],
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  samples: ReadonlyMap<string, RealmVegetationFieldSample>,
  playableKeys: ReadonlySet<string>
) {
  const output = new Map<string, number>();
  cells.forEach((cell) => {
    const key = hexKey(cell.coord);
    if (!playableKeys.has(key)) return;
    const sample = samples.get(key);
    const kind = terrainKindsByKey.get(key);
    if (!sample || (kind !== 'forest' && kind !== 'lowland' && kind !== 'meadow')) return;
    const value = clamp(sample.woodlandPotential * 0.78 + sample.forestNeighbourShare * 0.22);
    if (value > 0.08) output.set(key, value);
  });
  return output;
}
