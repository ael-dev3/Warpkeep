import {
  axialToWorld,
  hexDistance,
  hexKey,
  hexNeighbors,
  parseHexKey,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import { deriveChannelSeed, seededSignedFloat, seededUnitFloat } from './realmSeed';
import type { RealmTerrainKind } from './realmTerrainSemantics';
import { pointyHexBoundaryDistance } from './terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  isPlacementClear,
  terrainPlacementsForCell,
  type TerrainStructurePlacement
} from './terrainPlacements';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

/**
 * A renderer-only ecoregion pass. It deliberately derives from, rather than
 * changes, the canonical terrain semantics: `terrainKind` remains the world
 * authority for movement, resources, and every server-side rule.
 */
export type RealmForestBiomeQuality = 'high' | 'balanced' | 'reduced';

export type RealmForestSpecies = Readonly<{
  id: string;
  /** Estimated triangles for the selected quality LOD, used before GPU work. */
  triangles: number;
  /**
   * Exact normalized AABB diameter for this selected immutable LOD. The
   * renderer derives it from source geometry; planning uses it only to avoid
   * visual canopy clipping, never as collision or navigation authority.
   */
  footprintDiameter?: number;
  /** Informational catalog tags retained for deterministic future biome mixes. */
  biomes?: readonly string[];
}>;

export type RealmForestTreePoint = Readonly<{
  speciesId: string;
  coord: HexCoord;
  world: HexWorldPosition;
  rotation: number;
  scale: number;
  /** Dense groves get a little more visual mass than a forest edge. */
  habitat: 'grove' | 'forest' | 'fringe';
  estimatedTriangles: number;
  /** Selected immutable LOD footprint before this point's authorized scale. */
  footprintDiameter: number;
}>;

export type RealmForestBiomeCounts = Readonly<{
  forestSemanticCellCount: number;
  groveCellCount: number;
  fringeCellCount: number;
  eligibleFoliageCellCount: number;
  openFoliageCellCount: number;
  openCellCount: number;
  treeCount: number;
  speciesCount: number;
  estimatedTriangleCount: number;
}>;

export type RealmForestBiomeData = Readonly<{
  points: readonly RealmForestTreePoint[];
  /** A non-authoritative renderer tint weight keyed by the existing cell key. */
  canopyByTileKey: ReadonlyMap<string, number>;
  counts: RealmForestBiomeCounts;
  instanceBudget: number;
  triangleBudget: number;
}>;

export const REALM_FOREST_BIOME_BUDGETS: Readonly<Record<
  RealmForestBiomeQuality,
  Readonly<{ instances: number; triangles: number }>
>> = Object.freeze({
  // The immutable tree bundle caps one High tree at 1,200 triangles. These
  // ceilings leave headroom for the terrain, castles, Gold Mine, and HUD while
  // still forming several clearly dense groves in a radius-twenty realm.
  high: Object.freeze({ instances: 560, triangles: 420_000 }),
  balanced: Object.freeze({ instances: 280, triangles: 150_000 }),
  reduced: Object.freeze({ instances: 140, triangles: 32_000 })
});

export type GenerateRealmForestBiomeOptions = Readonly<{
  quality: RealmForestBiomeQuality;
  species: readonly RealmForestSpecies[];
  hexSize?: number;
  placements?: readonly TerrainStructurePlacement[];
  suppressedTileKeys?: ReadonlySet<string>;
  /**
   * Explicit presentation-only corridor/footprint reservation. The scene uses
   * this for Gold sites and their visible wagon belts; it never changes route
   * authority or tile passability.
   */
  protectedTileKeys?: ReadonlySet<string>;
  /**
   * Authoritative passability is supplied by the scene boundary when present.
   * A false/throwing predicate always suppresses scenery; trees never become
   * collision or pathfinding authority themselves.
   */
  isCoordPassable?: (coord: HexCoord) => boolean;
  /** Allows the scene to reserve room for non-tree semantic detail. */
  maximumInstanceCount?: number;
  maximumTriangleCount?: number;
}>;

type ForestAnchor = Readonly<{
  coord: HexCoord;
  radius: number;
  strength: number;
}>;

type ForestEcology = 'wetland' | 'settlement' | 'coniferous' | 'deciduous';

type TreeCandidate = Readonly<{
  coord: HexCoord;
  world: HexWorldPosition;
  rotation: number;
  scale: number;
  habitat: RealmForestTreePoint['habitat'];
  ecology: ForestEcology;
  priority: number;
  biodiversityOrder: number;
}>;

type AssignedTreeCandidate = TreeCandidate & Readonly<{
  species: RealmForestSpecies;
}>;

const TREE_STRUCTURE_CLEARANCE = 0.16;
const TREE_LOCAL_RADIUS = 0.56;
export const REALM_FOREST_TREE_MINIMUM_SEPARATION = 0.22;
/** Allows a slight natural canopy overlap but never deep broadleaf clipping. */
export const REALM_FOREST_CANOPY_SEPARATION_FACTOR = 0.85;
const DEFAULT_TREE_FOOTPRINT_DIAMETER = 0.46;
const MIN_FOREST_ANCHOR_SPACING = 3;
const MAX_FOREST_ANCHORS = 22;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - normalized * 2);
}

function isFoliageTerrain(kind: RealmTerrainKind | undefined) {
  return kind === 'forest' || kind === 'lowland' || kind === 'meadow';
}

function isPassable(
  cell: TerrainCell,
  isCoordPassable: GenerateRealmForestBiomeOptions['isCoordPassable']
) {
  if (!isCoordPassable) return true;
  try {
    return isCoordPassable(cell.coord) === true;
  } catch {
    return false;
  }
}

function validSpecies(species: readonly RealmForestSpecies[]) {
  const byId = new Map<string, RealmForestSpecies>();
  species.forEach((candidate) => {
    if (
      typeof candidate.id !== 'string'
      || candidate.id.length === 0
      || candidate.id.trim() !== candidate.id
      || byId.has(candidate.id)
    ) return;
    byId.set(candidate.id, Object.freeze({
      id: candidate.id,
      triangles: Number.isSafeInteger(candidate.triangles) && candidate.triangles > 0
        ? candidate.triangles
        : 1,
      ...(Number.isFinite(candidate.footprintDiameter) && candidate.footprintDiameter! > 0
        ? { footprintDiameter: candidate.footprintDiameter }
        : {}),
      ...(candidate.biomes === undefined ? {} : { biomes: Object.freeze([...candidate.biomes]) })
    }));
  });
  return Object.freeze([...byId.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function normalizedBudget(
  quality: RealmForestBiomeQuality,
  maximumInstanceCount: number | undefined,
  maximumTriangleCount: number | undefined
) {
  const defaults = REALM_FOREST_BIOME_BUDGETS[quality];
  const instances = Number.isSafeInteger(maximumInstanceCount)
    ? Math.max(0, Math.min(defaults.instances, maximumInstanceCount ?? 0))
    : defaults.instances;
  const triangles = Number.isSafeInteger(maximumTriangleCount)
    ? Math.max(0, Math.min(defaults.triangles, maximumTriangleCount ?? 0))
    : defaults.triangles;
  return Object.freeze({ instances, triangles });
}

function createForestAnchors(
  cells: readonly TerrainCell[],
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  suppressedTileKeys: ReadonlySet<string>,
  isCoordPassable: GenerateRealmForestBiomeOptions['isCoordPassable']
) {
  const forests = cells.filter((cell) => (
    terrainKindsByKey.get(hexKey(cell.coord)) === 'forest'
    && !suppressedTileKeys.has(hexKey(cell.coord))
    && isPassable(cell, isCoordPassable)
  ));
  const desiredCount = Math.min(
    MAX_FOREST_ANCHORS,
    forests.length >= 36 ? 18 + Math.min(4, Math.floor(forests.length / 70)) : Math.max(1, Math.ceil(forests.length / 4))
  );
  const orderedForests = [...forests].sort((left, right) => (
    deriveChannelSeed(left.seed, 0, 0, 'lush-forest-anchor')
    - deriveChannelSeed(right.seed, 0, 0, 'lush-forest-anchor')
    || left.coord.q - right.coord.q
    || left.coord.r - right.coord.r
  ));
  const anchors: ForestAnchor[] = [];
  const selectAtSpacing = (minimumSpacing: number) => {
    orderedForests.forEach((cell) => {
      if (anchors.length >= desiredCount) return;
      if (anchors.some((anchor) => hexDistance(anchor.coord, cell.coord) < minimumSpacing)) return;
      anchors.push(Object.freeze({
        coord: Object.freeze({ ...cell.coord }),
        radius: 2 + seededUnitFloat(
          deriveChannelSeed(cell.seed, 0, 0, 'lush-forest-anchor-radius')
        ) * 2,
        strength: 0.82 + seededUnitFloat(
          deriveChannelSeed(cell.seed, 0, 0, 'lush-forest-anchor-strength')
        ) * 0.18
      }));
    });
  };
  selectAtSpacing(MIN_FOREST_ANCHOR_SPACING);
  if (anchors.length < desiredCount) selectAtSpacing(2);

  // Small fixtures and unusual future maps still get one deterministic grove
  // rather than a completely flat visual world.
  if (anchors.length === 0 && forests.length > 0) {
    const fallback = [...forests].sort((left, right) => (
      deriveChannelSeed(left.seed, 0, 0, 'lush-forest-anchor-fallback')
      - deriveChannelSeed(right.seed, 0, 0, 'lush-forest-anchor-fallback')
      || left.coord.q - right.coord.q
      || left.coord.r - right.coord.r
    ))[0]!;
    anchors.push(Object.freeze({
      coord: Object.freeze({ ...fallback.coord }),
      radius: 3,
      strength: 0.9
    }));
  }
  return Object.freeze(anchors.sort((left, right) => (
    left.coord.q - right.coord.q || left.coord.r - right.coord.r
  )));
}

function clusterStrength(
  cell: TerrainCell,
  anchors: readonly ForestAnchor[]
) {
  let strongest = 0;
  anchors.forEach((anchor) => {
    const organicDistance = Math.max(0, hexDistance(cell.coord, anchor.coord)
      + seededSignedFloat(
        deriveChannelSeed(cell.seed, anchor.coord.q, anchor.coord.r, 'lush-forest-cluster-edge')
      ) * 0.33);
    const radial = 1 - organicDistance / anchor.radius;
    strongest = Math.max(
      strongest,
      smoothstep(0.03, 0.9, radial) * anchor.strength
    );
  });
  return clamp(strongest, 0, 1);
}

function canopyForCell(
  cell: TerrainCell,
  terrainKind: RealmTerrainKind,
  cluster: number
) {
  if (terrainKind === 'forest') {
    // A lone canonical forest cell is not automatically a tree island. Only
    // the stable anchor field grows visible woodland, turning the otherwise
    // scattered semantic hash into a small number of legible natural groves.
    return smoothstep(0.23, 0.88, cluster);
  }
  if (terrainKind === 'meadow') {
    return smoothstep(0.28, 0.9, cluster) * 0.78;
  }
  if (terrainKind === 'lowland') {
    return smoothstep(0.35, 0.93, cluster) * 0.66;
  }
  return 0;
}

function habitatForCanopy(canopy: number): RealmForestTreePoint['habitat'] {
  if (canopy >= 0.78) return 'grove';
  if (canopy >= 0.36) return 'forest';
  return 'fringe';
}

function hasBiomeTag(species: RealmForestSpecies, tag: string) {
  return species.biomes?.some((biome) => biome.toLowerCase() === tag) === true;
}

function ecologyForCell(
  cell: TerrainCell,
  terrainKind: RealmTerrainKind,
  habitat: RealmForestTreePoint['habitat'],
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  placements: readonly TerrainStructurePlacement[]
): ForestEcology {
  const nearLake = hexNeighbors(cell.coord).some((coord) => (
    terrainKindsByKey.get(hexKey(coord)) === 'lake'
  ));
  if (nearLake || cell.moisture > 0.42) return 'wetland';
  if (placements.some((placement) => hexDistance(placement.coord, cell.coord) <= 2)) {
    return 'settlement';
  }
  if (terrainKind === 'forest' || habitat === 'grove') return 'coniferous';
  return 'deciduous';
}

function expectedTreeCount(
  quality: RealmForestBiomeQuality,
  terrainKind: RealmTerrainKind,
  canopy: number,
  cell: TerrainCell
) {
  if (canopy <= 0.14) return 0;
  const forest = terrainKind === 'forest';
  const base = quality === 'high'
    ? (forest ? 0.48 : 0.04)
    : quality === 'balanced'
      ? (forest ? 0.28 : 0.02)
      : (forest ? 0.1 : 0);
  const multiplier = quality === 'high' ? 4.55 : quality === 'balanced' ? 2.65 : 1.3;
  const expected = base + canopy * multiplier;
  const whole = Math.floor(expected);
  const remainder = expected - whole;
  return whole + Number(seededUnitFloat(
    deriveChannelSeed(cell.seed, 0, 0, `lush-forest-density-${quality}`)
  ) < remainder);
}

function candidateWorld(
  cell: TerrainCell,
  index: number,
  attempt: number,
  hexSize: number
) {
  const center = axialToWorld(cell.coord, hexSize);
  const angle = seededUnitFloat(
    deriveChannelSeed(cell.seed, index, attempt, 'lush-forest-tree-angle')
  ) * Math.PI * 2;
  const radius = Math.sqrt(seededUnitFloat(
    deriveChannelSeed(cell.seed, index, attempt, 'lush-forest-tree-radius')
  )) * TREE_LOCAL_RADIUS * hexSize;
  return Object.freeze({
    x: center.x + Math.cos(angle) * radius,
    z: center.z + Math.sin(angle) * radius
  });
}

function createTreeCandidate(
  cell: TerrainCell,
  index: number,
  habitat: RealmForestTreePoint['habitat'],
  ecology: ForestEcology,
  hexSize: number,
  localPlacements: readonly TerrainStructurePlacement[],
  existingTrees: readonly TreeCandidate[]
) {
  const center = axialToWorld(cell.coord, hexSize);
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const world = candidateWorld(cell, index, attempt, hexSize);
    const local = { x: world.x - center.x, z: world.z - center.z };
    if (pointyHexBoundaryDistance(local, hexSize) > 0.79) continue;
    if (!isPlacementClear(localPlacements, world, hexSize, TREE_STRUCTURE_CLEARANCE)) continue;
    // This is intentionally global, not just a same-cell check. A trunk can
    // sit near a shared hex edge, so adjacent cells must not independently
    // place another trunk into the same ground footprint.
    if (existingTrees.some((existing) => (
      Math.hypot(existing.world.x - world.x, existing.world.z - world.z)
      < REALM_FOREST_TREE_MINIMUM_SEPARATION * hexSize
    ))) continue;
    return Object.freeze({
      coord: Object.freeze({ ...cell.coord }),
      world,
      rotation: seededUnitFloat(
        deriveChannelSeed(cell.seed, index, attempt, 'lush-forest-tree-rotation')
      ) * Math.PI * 2,
      // Keep generated variation inside the reviewed runtime catalog range.
      scale: 0.9 + seededUnitFloat(
        deriveChannelSeed(cell.seed, index, attempt, 'lush-forest-tree-scale')
      ) * 0.2,
      habitat,
      ecology,
      priority: seededUnitFloat(
        deriveChannelSeed(cell.seed, index, attempt, 'lush-forest-tree-priority')
      ),
      biodiversityOrder: seededUnitFloat(
        deriveChannelSeed(cell.seed, index, attempt, 'lush-forest-biodiversity')
      )
    });
  }
  return undefined;
}

function orderSpecies(species: readonly RealmForestSpecies[], worldSeed: number) {
  return Object.freeze([...species].sort((left, right) => (
    deriveChannelSeed(worldSeed, 0, 0, `lush-forest-species-${left.id}`)
    - deriveChannelSeed(worldSeed, 0, 0, `lush-forest-species-${right.id}`)
    || left.id.localeCompare(right.id)
  )));
}

function preferredSpeciesForEcology(
  species: readonly RealmForestSpecies[],
  ecology: ForestEcology
) {
  const tags = ecology === 'wetland'
    ? ['wetland', 'river']
    : ecology === 'settlement'
      ? ['settlement']
      : ecology === 'coniferous'
        ? ['coniferous']
        : ['deciduous'];
  const preferred = species.filter((candidate) => tags.some((tag) => hasBiomeTag(candidate, tag)));
  return preferred.length > 0 ? preferred : species;
}

function assignSpecies(
  candidates: readonly TreeCandidate[],
  species: readonly RealmForestSpecies[],
  worldSeed: number,
  reserveFullCatalog: boolean
) {
  const orderedSpecies = orderSpecies(species, worldSeed);
  if (orderedSpecies.length === 0) return Object.freeze([] as AssignedTreeCandidate[]);
  const randomized = [...candidates].sort((left, right) => (
    left.biodiversityOrder - right.biodiversityOrder
    || left.coord.q - right.coord.q
    || left.coord.r - right.coord.r
    || left.rotation - right.rotation
  ));
  const ecologyOffsets = new Map<ForestEcology, number>();
  const assigned = randomized.map((candidate) => {
    const pool = preferredSpeciesForEcology(orderedSpecies, candidate.ecology);
    const offset = ecologyOffsets.get(candidate.ecology) ?? 0;
    ecologyOffsets.set(candidate.ecology, offset + 1);
    return Object.freeze({
      ...candidate,
      species: pool[offset % pool.length]!
    });
  });

  // High quality has enough room for one representative of every reviewed
  // runtime asset. Preserve the contextual assignment wherever possible, then
  // make the smallest deterministic replacement set for any otherwise-unused
  // catalog entry. This avoids a single default tree quietly becoming the only
  // live asset family while keeping almost every trunk ecology-matched.
  if (reserveFullCatalog && assigned.length >= orderedSpecies.length) {
    const represented = new Set(assigned.map((candidate) => candidate.species.id));
    orderedSpecies.forEach((missing) => {
      if (represented.has(missing.id)) return;
      const replacement = [...assigned].sort((left, right) => (
        left.priority - right.priority
        || left.coord.q - right.coord.q
        || left.coord.r - right.coord.r
      )).find((candidate) => {
        const count = assigned.filter((assignedCandidate) => (
          assignedCandidate.species.id === candidate.species.id
        )).length;
        return count > 1;
      });
      if (!replacement) return;
      const index = assigned.indexOf(replacement);
      if (index < 0) return;
      assigned[index] = Object.freeze({ ...replacement, species: missing });
      represented.add(missing.id);
    });
  }
  return Object.freeze(assigned);
}

function normalizedFootprintDiameter(species: RealmForestSpecies) {
  const value = species.footprintDiameter;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TREE_FOOTPRINT_DIAMETER;
  }
  return Math.min(1.25, Math.max(0.04, value));
}

/**
 * Presentation-only clearance for two selected immutable models. A point's
 * uniform scale remains inside the catalog-authorized [0.9, 1.1] interval;
 * this simply leaves enough room for wide oaks and willows to read as trees
 * rather than intersecting billboard-like masses.
 */
export function realmForestCanopyMinimumSeparation(
  first: Pick<RealmForestTreePoint, 'footprintDiameter' | 'scale'>,
  second: Pick<RealmForestTreePoint, 'footprintDiameter' | 'scale'>
) {
  const firstDiameter = Math.max(0.04, first.footprintDiameter) * first.scale;
  const secondDiameter = Math.max(0.04, second.footprintDiameter) * second.scale;
  return Math.max(
    REALM_FOREST_TREE_MINIMUM_SEPARATION,
    (firstDiameter + secondDiameter) * 0.5 * REALM_FOREST_CANOPY_SEPARATION_FACTOR
  );
}

function candidateCanFitForestCanopy(
  candidate: AssignedTreeCandidate,
  selected: readonly AssignedTreeCandidate[],
  hexSize: number
) {
  const candidateFootprint = normalizedFootprintDiameter(candidate.species);
  return selected.every((existing) => {
    const required = realmForestCanopyMinimumSeparation(
      { footprintDiameter: candidateFootprint, scale: candidate.scale },
      {
        footprintDiameter: normalizedFootprintDiameter(existing.species),
        scale: existing.scale
      }
    ) * hexSize;
    return Math.hypot(
      existing.world.x - candidate.world.x,
      existing.world.z - candidate.world.z
    ) >= required;
  });
}

function selectCandidates(
  candidates: readonly AssignedTreeCandidate[],
  instanceBudget: number,
  triangleBudget: number,
  hexSize: number,
  reserveFullCatalog: boolean
) {
  const selected: AssignedTreeCandidate[] = [];
  const selectedSet = new Set<AssignedTreeCandidate>();
  let triangles = 0;
  const admit = (candidate: AssignedTreeCandidate) => {
    if (
      selected.length >= instanceBudget
      || triangles + candidate.species.triangles > triangleBudget
      || !candidateCanFitForestCanopy(candidate, selected, hexSize)
    ) return false;
    selected.push(candidate);
    selectedSet.add(candidate);
    triangles += candidate.species.triangles;
    return true;
  };

  // Reserve one deterministic representative of each supplied runtime asset
  // when budget permits. The tree catalog is therefore genuinely diverse,
  // rather than treating the last-added asset as a cosmetic dead path.
  const candidatesBySpecies = new Map<string, AssignedTreeCandidate[]>();
  candidates.forEach((candidate) => {
    const bucket = candidatesBySpecies.get(candidate.species.id);
    if (bucket) bucket.push(candidate);
    else candidatesBySpecies.set(candidate.species.id, [candidate]);
  });
  const deterministicBucketCandidates = (bucket: readonly AssignedTreeCandidate[]) => (
    [...bucket].sort((left, right) => (
      right.priority - left.priority
      || left.coord.q - right.coord.q
      || left.coord.r - right.coord.r
      || left.rotation - right.rotation
    ))
  );
  const bucketOrdering = [
    (left: readonly AssignedTreeCandidate[], right: readonly AssignedTreeCandidate[]) => (
      normalizedFootprintDiameter(right[0]!.species) - normalizedFootprintDiameter(left[0]!.species)
      || left[0]!.species.id.localeCompare(right[0]!.species.id)
    ),
    (left: readonly AssignedTreeCandidate[], right: readonly AssignedTreeCandidate[]) => (
      normalizedFootprintDiameter(left[0]!.species) - normalizedFootprintDiameter(right[0]!.species)
      || left[0]!.species.id.localeCompare(right[0]!.species.id)
    ),
    (left: readonly AssignedTreeCandidate[], right: readonly AssignedTreeCandidate[]) => (
      left[0]!.species.id.localeCompare(right[0]!.species.id)
    )
  ] as const;
  if (reserveFullCatalog) {
    let bestRepresentativeSet: AssignedTreeCandidate[] = [];
    let bestRepresentativeScore = Number.NEGATIVE_INFINITY;
    bucketOrdering.forEach((order) => {
      const provisional: AssignedTreeCandidate[] = [];
      let provisionalTriangles = 0;
      [...candidatesBySpecies.values()]
        .sort(order)
        .forEach((bucket) => {
          deterministicBucketCandidates(bucket).some((candidate) => {
            if (
              provisional.length >= instanceBudget
              || provisionalTriangles + candidate.species.triangles > triangleBudget
              || !candidateCanFitForestCanopy(candidate, provisional, hexSize)
            ) return false;
            provisional.push(candidate);
            provisionalTriangles += candidate.species.triangles;
            return true;
          });
        });
      const score = provisional.reduce((total, candidate) => total + candidate.priority, 0);
      if (
        provisional.length > bestRepresentativeSet.length
        || (provisional.length === bestRepresentativeSet.length && score > bestRepresentativeScore)
      ) {
        bestRepresentativeSet = provisional;
        bestRepresentativeScore = score;
      }
    });
    bestRepresentativeSet.forEach((candidate) => {
      selected.push(candidate);
      selectedSet.add(candidate);
      triangles += candidate.species.triangles;
    });
  }
  [...candidates]
    .filter((candidate) => !selectedSet.has(candidate))
    .sort((left, right) => (
      right.priority - left.priority
      || left.coord.q - right.coord.q
      || left.coord.r - right.coord.r
      || left.rotation - right.rotation
    ))
    .forEach(admit);

  return Object.freeze({
    selected: Object.freeze(selected.sort((left, right) => (
      left.coord.q - right.coord.q
      || left.coord.r - right.coord.r
      || left.rotation - right.rotation
    ))),
    triangles
  });
}

/**
 * Builds stable, non-interactive forest presentation points from existing
 * world cells. Forest anchors cluster canonical woodland into groves and only
 * allow restrained fringes into neighboring meadow/lowland cells, leaving
 * most of the map visibly open. No output is persisted or consulted by game
 * authority, pathfinding, resource settlement, or input handling.
 */
export function generateRealmForestBiomes(
  renderMap: RealmTerrainMap,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  options: GenerateRealmForestBiomeOptions
): RealmForestBiomeData {
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0
    ? options.hexSize!
    : 1;
  const placements = options.placements ?? EMPTY_TERRAIN_PLACEMENTS;
  const suppressedTileKeys = new Set([
    ...(options.suppressedTileKeys ?? new Set<string>()),
    ...(options.protectedTileKeys ?? new Set<string>())
  ]);
  const species = validSpecies(options.species);
  const budget = normalizedBudget(
    options.quality,
    options.maximumInstanceCount,
    options.maximumTriangleCount
  );
  const anchors = createForestAnchors(
    renderMap.cells,
    terrainKindsByKey,
    suppressedTileKeys,
    options.isCoordPassable
  );
  const canopyByTileKey = new Map<string, number>();
  const candidates: TreeCandidate[] = [];
  let forestSemanticCellCount = 0;
  let groveCellCount = 0;
  let fringeCellCount = 0;
  let eligibleFoliageCellCount = 0;
  let openFoliageCellCount = 0;
  let openCellCount = 0;

  renderMap.cells.forEach((cell) => {
    const tileKey = hexKey(cell.coord);
    const terrainKind = terrainKindsByKey.get(tileKey);
    if (
      terrainKind === undefined
      || suppressedTileKeys.has(tileKey)
      || !isPassable(cell, options.isCoordPassable)
    ) return;
    if (terrainKind === 'forest') forestSemanticCellCount += 1;
    if (!isFoliageTerrain(terrainKind)) {
      openCellCount += 1;
      return;
    }
    eligibleFoliageCellCount += 1;
    const canopy = canopyForCell(cell, terrainKind, clusterStrength(cell, anchors));
    if (canopy <= 0.14) {
      openCellCount += 1;
      openFoliageCellCount += 1;
      return;
    }
    canopyByTileKey.set(tileKey, canopy);
    const habitat = habitatForCanopy(canopy);
    if (habitat === 'grove') groveCellCount += 1;
    else if (habitat === 'fringe') fringeCellCount += 1;
    const count = expectedTreeCount(options.quality, terrainKind, canopy, cell);
    if (count === 0 || species.length === 0) return;
    const ecology = ecologyForCell(
      cell,
      terrainKind,
      habitat,
      terrainKindsByKey,
      placements
    );
    const localPlacements = terrainPlacementsForCell(
      placements,
      cell.coord,
      hexSize,
      TREE_STRUCTURE_CLEARANCE
    );
    for (let index = 0; index < count; index += 1) {
      const candidate = createTreeCandidate(
        cell,
        index,
        habitat,
        ecology,
        hexSize,
        localPlacements,
        candidates
      );
      if (!candidate) continue;
      candidates.push(candidate);
    }
  });

  // Do not leave a lone tree-bearing cell at the fringe of an anchor. It is
  // visually read as the old scattered-cell pattern even when its canopy
  // signal is technically valid. A cell needs a tree-bearing adjacent cell to
  // remain in a connected grove component; extra trunks in one cell alone do
  // not turn an isolated visual island into a forest.
  const candidateCountByTileKey = new Map<string, number>();
  candidates.forEach((candidate) => {
    const key = hexKey(candidate.coord);
    candidateCountByTileKey.set(key, (candidateCountByTileKey.get(key) ?? 0) + 1);
  });
  const clusteredCandidates = candidates.filter((candidate) => {
    return hexNeighbors(candidate.coord).some((neighbor) => (
      (candidateCountByTileKey.get(hexKey(neighbor)) ?? 0) > 0
    ));
  });

  const assigned = assignSpecies(
    clusteredCandidates,
    species,
    renderMap.worldSeed,
    options.quality === 'high'
  );
  const selected = selectCandidates(
    assigned,
    budget.instances,
    budget.triangles,
    hexSize,
    options.quality === 'high'
  );
  const points = Object.freeze(selected.selected.map((candidate): RealmForestTreePoint => Object.freeze({
    speciesId: candidate.species.id,
    coord: Object.freeze({ ...candidate.coord }),
    world: Object.freeze({ ...candidate.world }),
    rotation: candidate.rotation,
    scale: candidate.scale,
    habitat: candidate.habitat,
    estimatedTriangles: candidate.species.triangles,
    footprintDiameter: normalizedFootprintDiameter(candidate.species)
  })));
  const speciesCount = new Set(points.map((point) => point.speciesId)).size;
  // The terrain tint should communicate the same connected groves as the
  // trunks. Drop a canopy cell with no canopy-neighbor so it cannot leave a
  // visually mysterious one-hex green island after point filtering.
  const connectedCanopyByTileKey = new Map([...canopyByTileKey].filter(([key]) => {
    const coord = parseHexKey(key);
    return coord !== null && hexNeighbors(coord).some((neighbor) => (
      canopyByTileKey.has(hexKey(neighbor))
    ));
  }));

  return Object.freeze({
    points,
    canopyByTileKey: connectedCanopyByTileKey,
    counts: Object.freeze({
      forestSemanticCellCount,
      groveCellCount,
      fringeCellCount,
      eligibleFoliageCellCount,
      openFoliageCellCount,
      openCellCount,
      treeCount: points.length,
      speciesCount,
      estimatedTriangleCount: selected.triangles
    }),
    instanceBudget: budget.instances,
    triangleBudget: budget.triangles
  });
}
