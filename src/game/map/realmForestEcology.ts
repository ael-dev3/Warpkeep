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
export const REALM_FOREST_ECOLOGY_VERSION = 'crafted-lowlands-forest-ecology-v2';

export type RealmForestEcologyQuality = 'high' | 'balanced' | 'reduced';
export type RealmForestEcologyHabitat = 'grove' | 'forest' | 'fringe';
export type RealmForestEcologyStructure = 'core' | 'body' | 'fringe' | 'clearing';
export type RealmForestStructureCounts = Readonly<Record<
  RealmForestEcologyStructure,
  number
>>;

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
  /**
   * Renderer-only mass composition. `null` means the cell is outside the
   * eligible/passable foliage envelope and must not be reported as a clearing.
   */
  structure: RealmForestEcologyStructure | null;
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
export const REALM_FOREST_SPECIES_PATCH_SPAN = 3;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createRealmForestStructureCounts(): Record<
  RealmForestEcologyStructure,
  number
> {
  return { core: 0, body: 0, fringe: 0, clearing: 0 };
}

export function realmForestStructureForHabitat(
  habitat: RealmForestEcologyHabitat
): Exclude<RealmForestEcologyStructure, 'clearing'> {
  if (habitat === 'grove') return 'core';
  if (habitat === 'forest') return 'body';
  return 'fringe';
}

/**
 * Summarize canonical/shared trees without changing their rows or transforms.
 * A cell with multiple trees is counted once at its strongest habitat.
 */
export function summarizeRealmForestStructure(
  points: readonly Pick<RealmForestTreePoint, 'coord' | 'habitat'>[],
  clearingCellCount = 0
): RealmForestStructureCounts {
  const priority: Readonly<Record<Exclude<RealmForestEcologyStructure, 'clearing'>, number>> = {
    core: 3,
    body: 2,
    fringe: 1
  };
  const byCell = new Map<string, Exclude<RealmForestEcologyStructure, 'clearing'>>();
  points.forEach((point) => {
    const key = hexKey(point.coord);
    const structure = realmForestStructureForHabitat(point.habitat);
    const previous = byCell.get(key);
    if (!previous || priority[structure] > priority[previous]) byCell.set(key, structure);
  });
  const counts = createRealmForestStructureCounts();
  byCell.forEach((structure) => {
    counts[structure] += 1;
  });
  counts.clearing = Math.max(0, Math.trunc(
    Number.isFinite(clearingCellCount) ? clearingCellCount : 0
  ));
  return Object.freeze(counts);
}

/**
 * Stable ground-footprint coverage rather than a camera-derived screen metric.
 * It is intentionally bounded and useful in headless regression telemetry.
 */
export function realmForestSilhouetteCoverageRatio(
  points: readonly Readonly<{
    footprintDiameter: number;
    scale: number;
    /** Admission-only edge value; admitted trees always render full scale. */
    edgeFade?: number;
  }>[],
  activeCellCount: number,
  hexSizeInput = 1
) {
  const activeCells = Math.max(
    0,
    Math.trunc(Number.isFinite(activeCellCount) ? activeCellCount : 0)
  );
  if (activeCells === 0 || points.length === 0) return 0;
  const hexSize = Number.isFinite(hexSizeInput) && hexSizeInput > 0 ? hexSizeInput : 1;
  const visibleArea = points.reduce((total, point) => {
    const diameter = Number.isFinite(point.footprintDiameter)
      ? Math.max(0, point.footprintDiameter)
      : 0;
    const scale = Number.isFinite(point.scale) ? Math.max(0, point.scale) : 0;
    const radius = diameter * scale * 0.5;
    return total + Math.PI * radius * radius;
  }, 0);
  const pointyHexArea = 3 * Math.sqrt(3) * hexSize * hexSize / 2;
  return clamp(visibleArea / (activeCells * pointyHexArea));
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

export function realmForestSpeciesPatchKey(coord: HexCoord) {
  return `${Math.floor(coord.q / REALM_FOREST_SPECIES_PATCH_SPAN)},${Math.floor(
    coord.r / REALM_FOREST_SPECIES_PATCH_SPAN
  )}`;
}

function speciesForPatch(
  species: readonly RealmForestSpecies[],
  cell: TerrainCell,
  worldSeed: number,
  structure: RealmForestEcologyStructure
) {
  if (species.length === 0) return undefined;
  const patchQ = Math.floor(cell.coord.q / REALM_FOREST_SPECIES_PATCH_SPAN);
  const patchR = Math.floor(cell.coord.r / REALM_FOREST_SPECIES_PATCH_SPAN);
  const rank = seededUnitFloat(deriveChannelSeed(
    worldSeed,
    patchQ,
    patchR,
    `${REALM_FOREST_ECOLOGY_VERSION}:species-patch:${structure}`
  ));
  return species[Math.min(species.length - 1, Math.floor(rank * species.length))];
}

function ecologyStructure(
  terrainKind: RealmTerrainKind,
  canopyContribution: number,
  seed: number
): RealmForestEcologyStructure {
  const clearingSignal = seededUnitFloat(deriveChannelSeed(
    seed,
    0,
    0,
    `${REALM_FOREST_ECOLOGY_VERSION}:clearing`
  ));
  const clearingThreshold = terrainKind === 'forest' ? 0.085 : 0.14;
  if (canopyContribution <= 0.08 || clearingSignal < clearingThreshold) return 'clearing';
  if (terrainKind === 'forest' && canopyContribution >= 0.72) return 'core';
  if (canopyContribution >= 0.38) return 'body';
  return 'fringe';
}

function candidateCount(
  quality: RealmForestEcologyQuality,
  terrainKind: RealmTerrainKind,
  vegetation: RealmVegetationFieldSample,
  structure: RealmForestEcologyStructure,
  canopyContribution: number,
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
  const structureDensity: Readonly<Record<RealmForestEcologyStructure, number>> = {
    core: 1,
    body: 0.74,
    fringe: 0.43,
    clearing: 0
  };
  const expected = base
    * structureDensity[structure]
    * (0.58 + clamp(canopyContribution) * 0.42);
  const whole = Math.floor(expected);
  const remainder = expected - whole;
  const jitter = seededUnitFloat(deriveChannelSeed(
    seed,
    0,
    0,
    `${REALM_FOREST_ECOLOGY_VERSION}:density`
  ));
  return Math.min(base, whole + Number(jitter < remainder));
}

function scaleForStructure(
  structure: RealmForestEcologyStructure,
  seed: number,
  index: number,
  attempt: number
) {
  const range: Readonly<Record<RealmForestEcologyStructure, readonly [number, number]>> = {
    core: [1, 1.14],
    body: [0.9, 1.06],
    fringe: [0.78, 0.94],
    clearing: [0.78, 0.9]
  };
  const [minimum, maximum] = range[structure];
  return minimum + seededUnitFloat(deriveChannelSeed(
    seed,
    index,
    attempt,
    `${REALM_FOREST_ECOLOGY_VERSION}:scale`
  )) * (maximum - minimum);
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
  const foliage = options.terrainKind === 'forest'
    || options.terrainKind === 'lowland'
    || options.terrainKind === 'meadow';
  if (!options.playable || !foliage || !passable) {
    return Object.freeze({
      cellKey,
      coord: Object.freeze({ ...cell.coord }),
      terrainKind: options.terrainKind,
      canopyContribution,
      structure: null,
      candidates: Object.freeze([])
    });
  }
  const structure = ecologyStructure(
    options.terrainKind,
    canopyContribution,
    ecologyCell.seed
  );
  const species = paletteFor(validSpecies(options.species), options.terrainKind, options.vegetation);
  if (species.length === 0) {
    return Object.freeze({
      cellKey,
      coord: Object.freeze({ ...cell.coord }),
      terrainKind: options.terrainKind,
      canopyContribution,
      structure,
      candidates: Object.freeze([])
    });
  }
  const count = candidateCount(
    options.quality,
    options.terrainKind,
    options.vegetation,
    structure,
    canopyContribution,
    ecologyCell.seed
  );
  const placements = options.placements ?? EMPTY_TERRAIN_PLACEMENTS;
  const localPlacements = terrainPlacementsForCell(placements, cell.coord, hexSize, TREE_CLEARANCE);
  const canonical = options.authoritativeTrees ?? [];
  const selectedSpecies = speciesForPatch(
    species,
    cell,
    options.worldSeed,
    structure
  );
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
      if (!selectedSpecies) continue;
      const habitat: RealmForestEcologyHabitat = structure === 'core'
        ? 'grove'
        : structure === 'body'
          ? 'forest'
          : 'fringe';
      selected = Object.freeze({
        cellKey,
        speciesId: selectedSpecies.id,
        coord: Object.freeze({ ...cell.coord }),
        world,
        rotation: seededUnitFloat(deriveChannelSeed(ecologyCell.seed, index, attempt, `${REALM_FOREST_ECOLOGY_VERSION}:rotation`)) * Math.PI * 2,
        scale: scaleForStructure(structure, ecologyCell.seed, index, attempt),
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
    structure,
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
