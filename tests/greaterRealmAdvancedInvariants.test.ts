import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  clearGreaterRealmCandidateSecret,
  generateGreaterRealmCandidate,
  greaterRealmPrivateCanvas,
  type GreaterRealmPrivateCandidate,
} from '../scripts/atlas/greater-realm-candidate-generator';
import {
  GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
  transformLegacyLowlandsToGlobal,
} from '../scripts/atlas/greater-realm-legacy-lowlands';

const PINNED_ROOT_LABEL = 'greater-realm-ordinary-parent-a';
const PINNED_ORDINAL = 9;
const PRIVATE_CANVAS_RADIUS = 270;
const HEX_NEIGHBOR_COUNT = 6;
const REGION_COUNT = 10;
const TIER_III_REGION_INDEX = 9;
const DISTANCE_UNREACHED = 0xffff;
const EXPECTED_SEALED_GATE_COUNT = 18;
const EXPECTED_MAJOR_RIVER_DISCHARGE = 144n;

const AXIAL_DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
] as const);

type ComponentAudit = Readonly<{
  componentId: Int32Array;
  sizes: readonly number[];
  touchesBoundary: readonly boolean[];
}>;

type PassableRegionAudit = Readonly<{
  componentId: Int32Array;
  componentSizes: readonly number[];
  passableCounts: readonly number[];
  largestCounts: readonly number[];
  largestSharesBasisPoints: readonly number[];
}>;

type RobustRegionAudit = Readonly<{
  articulation: Uint8Array;
  componentId: Int32Array;
  componentSizes: readonly number[];
  componentCells: readonly (readonly number[])[];
}>;

type BoundaryAudit = Readonly<{
  boundaryCells: readonly number[];
  maximumRadius: number;
  maximumRadiusShareBasisPoints: number;
  rotationalSimilarityBasisPoints: number;
  maximumAlignedBoundaryRun: number;
  minimumBoundaryLandDistance: number;
  saltwaterBoundaryBasisPoints: number;
}>;

let pinned: GreaterRealmPrivateCandidate | undefined;

function pinnedRoot(): Uint8Array {
  return Uint8Array.from(createHash('sha256')
    .update(`${PINNED_ROOT_LABEL}\0`, 'utf8')
    .digest());
}

function requirePinned(): GreaterRealmPrivateCandidate {
  if (!pinned) throw new Error('GREATER_REALM_ADVANCED_FIXTURE_MISSING');
  return pinned;
}

function axialDistance(q: number, r: number, otherQ = 0, otherR = 0): number {
  const deltaQ = q - otherQ;
  const deltaR = r - otherR;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(-deltaQ - deltaR));
}

function coordinateKey(q: number, r: number): string {
  return `${q},${r}`;
}

function auditComponents(
  candidate: GreaterRealmPrivateCandidate,
  included: Uint8Array,
  group?: Uint8Array,
): ComponentAudit {
  const componentId = new Int32Array(candidate.grid.cellCount);
  componentId.fill(-1);
  const sizes: number[] = [];
  const touchesBoundary: boolean[] = [];
  const queue = new Uint32Array(candidate.grid.cellCount);

  for (let start = 0; start < candidate.grid.cellCount; start += 1) {
    if (included[start] !== 1 || componentId[start] !== -1) continue;
    const id = sizes.length;
    const expectedGroup = group?.[start];
    let head = 0;
    let tail = 0;
    let size = 0;
    let reachesBoundary = false;
    componentId[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++]!;
      size += 1;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0) {
          reachesBoundary = true;
          continue;
        }
        if (
          included[neighbor] !== 1
          || componentId[neighbor] !== -1
          || (group && group[neighbor] !== expectedGroup)
        ) continue;
        componentId[neighbor] = id;
        queue[tail++] = neighbor;
      }
    }
    sizes.push(size);
    touchesBoundary.push(reachesBoundary);
  }

  return Object.freeze({
    componentId,
    sizes: Object.freeze(sizes),
    touchesBoundary: Object.freeze(touchesBoundary),
  });
}

function distanceFromMask(
  candidate: GreaterRealmPrivateCandidate,
  starts: Uint8Array,
): Uint16Array {
  const distance = new Uint16Array(candidate.grid.cellCount);
  distance.fill(DISTANCE_UNREACHED);
  const queue = new Uint32Array(candidate.grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    if (starts[cell] !== 1) continue;
    distance[cell] = 0;
    queue[tail++] = cell;
  }
  while (head < tail) {
    const cell = queue[head++]!;
    const nextDistance = distance[cell]! + 1;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || distance[neighbor] !== DISTANCE_UNREACHED) continue;
      distance[neighbor] = nextDistance;
      queue[tail++] = neighbor;
    }
  }
  return distance;
}

function auditPassableRegions(candidate: GreaterRealmPrivateCandidate): PassableRegionAudit {
  const passable = new Uint8Array(candidate.grid.cellCount);
  const passableCounts = Array<number>(REGION_COUNT).fill(0);
  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    if (
      ![0, 3, 4].includes(candidate.waterRegime[cell]!)
      || candidate.barrier[cell] !== 0
    ) continue;
    passable[cell] = 1;
    passableCounts[candidate.regionId[cell]!] += 1;
  }
  const components = auditComponents(candidate, passable, candidate.regionId);
  const largestCounts = Array<number>(REGION_COUNT).fill(0);
  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    const component = components.componentId[cell]!;
    if (component < 0) continue;
    const region = candidate.regionId[cell]!;
    largestCounts[region] = Math.max(largestCounts[region]!, components.sizes[component]!);
  }
  const largestSharesBasisPoints = passableCounts.map((count, region) => (
    count === 0 ? 0 : Math.round((largestCounts[region]! * 10_000) / count)
  ));
  return Object.freeze({
    componentId: components.componentId,
    componentSizes: components.sizes,
    passableCounts: Object.freeze(passableCounts),
    largestCounts: Object.freeze(largestCounts),
    largestSharesBasisPoints: Object.freeze(largestSharesBasisPoints),
  });
}

function auditRobustRegions(candidate: GreaterRealmPrivateCandidate): RobustRegionAudit {
  const passable = new Uint8Array(candidate.grid.cellCount);
  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    if (
      [0, 3, 4].includes(candidate.waterRegime[cell]!)
      && candidate.barrier[cell] === 0
    ) passable[cell] = 1;
  }
  const discovery = new Int32Array(candidate.grid.cellCount);
  const low = new Int32Array(candidate.grid.cellCount);
  const parent = new Int32Array(candidate.grid.cellCount);
  const nextNeighbor = new Uint8Array(candidate.grid.cellCount);
  const childCount = new Uint8Array(candidate.grid.cellCount);
  const articulation = new Uint8Array(candidate.grid.cellCount);
  const edgeStack: Array<readonly [number, number]> = [];
  const blocks: number[][] = [];
  discovery.fill(-1);
  parent.fill(-1);
  let clock = 0;
  for (let root = 0; root < candidate.grid.cellCount; root += 1) {
    if (passable[root] !== 1 || discovery[root] >= 0) continue;
    const stack = [root];
    discovery[root] = clock;
    low[root] = clock;
    clock += 1;
    while (stack.length > 0) {
      const cell = stack[stack.length - 1]!;
      const direction = nextNeighbor[cell]!;
      if (direction < HEX_NEIGHBOR_COUNT) {
        nextNeighbor[cell] = direction + 1;
        const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || candidate.regionId[neighbor] !== candidate.regionId[cell]
          || passable[neighbor] !== 1
        ) continue;
        if (discovery[neighbor] < 0) {
          parent[neighbor] = cell;
          childCount[cell] += 1;
          edgeStack.push(Object.freeze([cell, neighbor] as const));
          discovery[neighbor] = clock;
          low[neighbor] = clock;
          clock += 1;
          stack.push(neighbor);
        } else if (neighbor !== parent[cell] && discovery[neighbor]! < discovery[cell]!) {
          edgeStack.push(Object.freeze([cell, neighbor] as const));
          low[cell] = Math.min(low[cell]!, discovery[neighbor]!);
        }
        continue;
      }
      stack.pop();
      const ancestor = parent[cell]!;
      if (ancestor < 0) {
        if (childCount[cell]! > 1) articulation[cell] = 1;
        if (childCount[cell] === 0) blocks.push([cell]);
        expect(edgeStack, `root ${cell} leaves no unassigned DFS edge`).toHaveLength(0);
        continue;
      }
      low[ancestor] = Math.min(low[ancestor]!, low[cell]!);
      if (low[cell]! < discovery[ancestor]!) continue;
      if (parent[ancestor]! >= 0) articulation[ancestor] = 1;
      const vertices = new Set<number>();
      let foundTreeEdge = false;
      while (edgeStack.length > 0) {
        const [first, second] = edgeStack.pop()!;
        vertices.add(first);
        vertices.add(second);
        if (first === ancestor && second === cell) {
          foundTreeEdge = true;
          break;
        }
      }
      expect(foundTreeEdge, `tree edge ${ancestor}:${cell} closes one block`).toBe(true);
      blocks.push([...vertices].sort((first, second) => first - second));
    }
  }

  // Articulation vertices may occur in several Tarjan blocks. Mirror the
  // authority contract independently: the largest incident block owns the
  // vertex, stable discovery order breaks ties, and incomplete blocks are
  // discarded instead of becoming one-pass path fragments.
  const articulationOwner = new Int32Array(candidate.grid.cellCount);
  articulationOwner.fill(-1);
  for (let block = 0; block < blocks.length; block += 1) {
    for (const cell of blocks[block]!) {
      if (articulation[cell] !== 1) continue;
      const current = articulationOwner[cell]!;
      if (
        current < 0
        || blocks[block]!.length > blocks[current]!.length
        || (blocks[block]!.length === blocks[current]!.length && block < current)
      ) articulationOwner[cell] = block;
    }
  }
  const componentId = new Int32Array(candidate.grid.cellCount);
  componentId.fill(-1);
  const componentSizes: number[] = [];
  const componentCells: Array<readonly number[]> = [];
  for (let block = 0; block < blocks.length; block += 1) {
    const cells = blocks[block]!;
    if (cells.some(cell => (
      articulation[cell] === 1 && articulationOwner[cell] !== block
    ))) continue;
    const id = componentSizes.length;
    for (const cell of cells) {
      expect(componentId[cell], `robust core overlap at cell ${cell}`).toBe(-1);
      componentId[cell] = id;
    }
    componentSizes.push(cells.length);
    componentCells.push(Object.freeze([...cells]));
  }
  return Object.freeze({
    articulation,
    componentId,
    componentSizes: Object.freeze(componentSizes),
    componentCells: Object.freeze(componentCells),
  });
}

function inducedCoreArticulationCounts(
  neighbors: Int32Array,
  audit: RobustRegionAudit,
  minimumSize: number,
): Uint32Array {
  const cellCount = audit.componentId.length;
  const discovery = new Int32Array(cellCount);
  const low = new Int32Array(cellCount);
  const parent = new Int32Array(cellCount);
  const nextNeighbor = new Uint8Array(cellCount);
  const childCount = new Uint8Array(cellCount);
  const articulation = new Uint8Array(cellCount);
  discovery.fill(-1);
  parent.fill(-1);
  let clock = 0;
  const accepted = (cell: number) => {
    const component = audit.componentId[cell]!;
    return component >= 0 && audit.componentSizes[component]! >= minimumSize;
  };
  for (let root = 0; root < cellCount; root += 1) {
    if (!accepted(root) || discovery[root] >= 0) continue;
    const rootComponent = audit.componentId[root]!;
    const stack = [root];
    discovery[root] = clock;
    low[root] = clock;
    clock += 1;
    while (stack.length > 0) {
      const cell = stack[stack.length - 1]!;
      const direction = nextNeighbor[cell]!;
      if (direction < HEX_NEIGHBOR_COUNT) {
        nextNeighbor[cell] = direction + 1;
        const neighbor = neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || audit.componentId[neighbor] !== rootComponent) continue;
        if (discovery[neighbor] < 0) {
          parent[neighbor] = cell;
          childCount[cell] += 1;
          discovery[neighbor] = clock;
          low[neighbor] = clock;
          clock += 1;
          stack.push(neighbor);
        } else if (neighbor !== parent[cell]) {
          low[cell] = Math.min(low[cell]!, discovery[neighbor]!);
        }
        continue;
      }
      stack.pop();
      const ancestor = parent[cell]!;
      if (ancestor < 0) {
        if (childCount[cell]! > 1) articulation[cell] = 1;
        continue;
      }
      low[ancestor] = Math.min(low[ancestor]!, low[cell]!);
      if (parent[ancestor]! >= 0 && low[cell]! >= discovery[ancestor]!) {
        articulation[ancestor] = 1;
      }
    }
  }
  const counts = new Uint32Array(audit.componentSizes.length);
  for (let cell = 0; cell < cellCount; cell += 1) {
    const component = audit.componentId[cell]!;
    if (component >= 0 && articulation[cell] === 1) counts[component] += 1;
  }
  return counts;
}

function largestComponentSize(
  candidate: GreaterRealmPrivateCandidate,
  included: Uint8Array,
): number {
  return Math.max(0, ...auditComponents(candidate, included).sizes);
}

function auditBoundary(candidate: GreaterRealmPrivateCandidate): BoundaryAudit {
  const boundaryCells: number[] = [];
  const boundaryByMissingDirection = Array.from(
    { length: HEX_NEIGHBOR_COUNT },
    () => new Uint8Array(candidate.grid.cellCount),
  );
  const dryLand = new Uint8Array(candidate.grid.cellCount);
  const radiusCounts = new Map<number, number>();
  const coordinateKeys = new Set<string>();

  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    const q = candidate.grid.q[cell]!;
    const r = candidate.grid.r[cell]!;
    coordinateKeys.add(coordinateKey(q, r));
    if (candidate.waterRegime[cell] === 0) dryLand[cell] = 1;
    let isBoundary = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] !== -1) continue;
      boundaryByMissingDirection[direction]![cell] = 1;
      isBoundary = true;
    }
    if (!isBoundary) continue;
    boundaryCells.push(cell);
    const radius = axialDistance(q, r);
    radiusCounts.set(radius, (radiusCounts.get(radius) ?? 0) + 1);
  }

  let rotatedIntersection = 0;
  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    const rotatedQ = -candidate.grid.r[cell]!;
    const rotatedR = candidate.grid.q[cell]! + candidate.grid.r[cell]!;
    if (coordinateKeys.has(coordinateKey(rotatedQ, rotatedR))) rotatedIntersection += 1;
  }
  const distanceToLand = distanceFromMask(candidate, dryLand);
  const maximumRadiusCount = Math.max(0, ...radiusCounts.values());
  const saltwaterBoundaryCells = boundaryCells.filter(
    cell => candidate.waterRegime[cell] === 1,
  ).length;
  let maximumAlignedBoundaryRun = 0;
  for (const directionBoundary of boundaryByMissingDirection) {
    maximumAlignedBoundaryRun = Math.max(
      maximumAlignedBoundaryRun,
      largestComponentSize(candidate, directionBoundary),
    );
  }

  return Object.freeze({
    boundaryCells: Object.freeze(boundaryCells),
    maximumRadius: Math.max(...boundaryCells.map(
      cell => axialDistance(candidate.grid.q[cell]!, candidate.grid.r[cell]!),
    )),
    maximumRadiusShareBasisPoints: boundaryCells.length === 0
      ? 10_000
      : Math.round((maximumRadiusCount * 10_000) / boundaryCells.length),
    rotationalSimilarityBasisPoints: Math.round(
      (rotatedIntersection * 10_000)
      / (candidate.grid.cellCount * 2 - rotatedIntersection),
    ),
    maximumAlignedBoundaryRun,
    minimumBoundaryLandDistance: Math.min(
      ...boundaryCells.map(cell => distanceToLand[cell]!),
    ),
    saltwaterBoundaryBasisPoints: boundaryCells.length === 0
      ? 0
      : Math.round((saltwaterBoundaryCells * 10_000) / boundaryCells.length),
  });
}

function enclosedInactiveCanvasCellCount(candidate: GreaterRealmPrivateCandidate): number {
  const sideLength = PRIVATE_CANVAS_RADIUS * 2 + 1;
  const encodedLength = sideLength * sideLength;
  const active = new Uint8Array(encodedLength);
  const exterior = new Uint8Array(encodedLength);
  const queue = new Uint32Array(encodedLength);
  const encode = (q: number, r: number) => (
    (q + PRIVATE_CANVAS_RADIUS) * sideLength + r + PRIVATE_CANVAS_RADIUS
  );
  let head = 0;
  let tail = 0;

  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    const q = candidate.grid.q[cell]!;
    const r = candidate.grid.r[cell]!;
    expect(axialDistance(q, r)).toBeLessThanOrEqual(PRIVATE_CANVAS_RADIUS);
    active[encode(q, r)] = 1;
  }
  for (let q = -PRIVATE_CANVAS_RADIUS; q <= PRIVATE_CANVAS_RADIUS; q += 1) {
    const minimumR = Math.max(-PRIVATE_CANVAS_RADIUS, -q - PRIVATE_CANVAS_RADIUS);
    const maximumR = Math.min(PRIVATE_CANVAS_RADIUS, -q + PRIVATE_CANVAS_RADIUS);
    for (let r = minimumR; r <= maximumR; r += 1) {
      if (axialDistance(q, r) !== PRIVATE_CANVAS_RADIUS) continue;
      const encoded = encode(q, r);
      if (active[encoded] === 1 || exterior[encoded] === 1) continue;
      exterior[encoded] = 1;
      queue[tail++] = encoded;
    }
  }
  while (head < tail) {
    const encoded = queue[head++]!;
    const q = Math.floor(encoded / sideLength) - PRIVATE_CANVAS_RADIUS;
    const r = encoded % sideLength - PRIVATE_CANVAS_RADIUS;
    for (const direction of AXIAL_DIRECTIONS) {
      const neighborQ = q + direction.q;
      const neighborR = r + direction.r;
      if (axialDistance(neighborQ, neighborR) > PRIVATE_CANVAS_RADIUS) continue;
      const neighbor = encode(neighborQ, neighborR);
      if (active[neighbor] === 1 || exterior[neighbor] === 1) continue;
      exterior[neighbor] = 1;
      queue[tail++] = neighbor;
    }
  }

  let enclosed = 0;
  for (let q = -PRIVATE_CANVAS_RADIUS; q <= PRIVATE_CANVAS_RADIUS; q += 1) {
    const minimumR = Math.max(-PRIVATE_CANVAS_RADIUS, -q - PRIVATE_CANVAS_RADIUS);
    const maximumR = Math.min(PRIVATE_CANVAS_RADIUS, -q + PRIVATE_CANVAS_RADIUS);
    for (let r = minimumR; r <= maximumR; r += 1) {
      const encoded = encode(q, r);
      if (active[encoded] !== 1 && exterior[encoded] !== 1) enclosed += 1;
    }
  }
  return enclosed;
}

beforeAll(() => {
  const root = pinnedRoot();
  try {
    pinned = generateGreaterRealmCandidate({
      rootSeed: root,
      candidateOrdinal: PINNED_ORDINAL,
    });
  } finally {
    root.fill(0);
  }
}, 60_000);

afterAll(() => {
  if (pinned) clearGreaterRealmCandidateSecret(pinned);
});

describe('Greater Realm advanced authority invariants', () => {
  it('has no enclosed inactive holes anywhere inside the radius-270 authority canvas', () => {
    expect(enclosedInactiveCanvasCellCount(requirePinned())).toBe(0);
  });

  it('independently derives a natural, saltwater, deeply buffered outer boundary', () => {
    const candidate = requirePinned();
    const boundary = auditBoundary(candidate);
    const naturalBoundary = boundary.boundaryCells.length > 0
      && boundary.maximumRadiusShareBasisPoints < 1_800
      && boundary.rotationalSimilarityBasisPoints < 9_300
      && boundary.maximumAlignedBoundaryRun <= 96;
    const deepOceanBoundary = boundary.maximumRadius <= PRIVATE_CANVAS_RADIUS - 8
      && boundary.minimumBoundaryLandDistance >= 8
      && boundary.saltwaterBoundaryBasisPoints === 10_000;

    expect(boundary.boundaryCells.length).toBeGreaterThan(0);
    expect(boundary.maximumAlignedBoundaryRun).toBeLessThanOrEqual(96);
    expect(boundary.minimumBoundaryLandDistance).toBeGreaterThanOrEqual(8);
    expect(boundary.saltwaterBoundaryBasisPoints).toBe(10_000);
    expect(boundary.maximumRadius).toBeLessThanOrEqual(PRIVATE_CANVAS_RADIUS - 8);
    expect(candidate.privateMetrics).toMatchObject({
      activeBoundaryCells: boundary.boundaryCells.length,
      maximumBoundaryRadiusShareBasisPoints: boundary.maximumRadiusShareBasisPoints,
      rotationalSimilarityBasisPoints: boundary.rotationalSimilarityBasisPoints,
      maximumAlignedBoundaryRun: boundary.maximumAlignedBoundaryRun,
      minimumBoundaryLandDistance: boundary.minimumBoundaryLandDistance,
      saltwaterBoundaryBasisPoints: boundary.saltwaterBoundaryBasisPoints,
    });
    expect(candidate.aggregate.proofs.naturalOuterBoundary).toBe(naturalBoundary);
    expect(candidate.aggregate.proofs.deepOceanBoundary).toBe(deepOceanBoundary);
    expect(naturalBoundary).toBe(true);
    expect(deepOceanBoundary).toBe(true);
  });

  it('independently rejects radial tiers and requires geological highland barriers', () => {
    const candidate = requirePinned();
    let tierThreeQ = 0;
    let tierThreeR = 0;
    let tierThreeCells = 0;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      if (candidate.tierId[cell] !== 3) continue;
      tierThreeQ += candidate.grid.q[cell]!;
      tierThreeR += candidate.grid.r[cell]!;
      tierThreeCells += 1;
    }
    const roundedRatio = (numerator: number) => numerator >= 0
      ? Math.floor((numerator * 2 + tierThreeCells) / (tierThreeCells * 2))
      : -Math.floor((-numerator * 2 + tierThreeCells) / (tierThreeCells * 2));
    const centerQ = roundedRatio(tierThreeQ);
    const centerR = roundedRatio(tierThreeR);
    const radialTiers = new Map<number, [number, number, number]>();
    let tierOneBoundaryEdges = 0;
    let radialTierOneBoundaryEdges = 0;
    const centerX = 2 * centerQ + centerR;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const radius = axialDistance(candidate.grid.q[cell]!, candidate.grid.r[cell]!, centerQ, centerR);
      const tiers = radialTiers.get(radius) ?? [0, 0, 0];
      tiers[candidate.tierId[cell]! - 1] += 1;
      radialTiers.set(radius, tiers);
      if (candidate.tierId[cell] !== 1) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor <= cell
          || candidate.tierId[neighbor] !== 1
          || candidate.regionId[neighbor] === candidate.regionId[cell]
        ) continue;
        tierOneBoundaryEdges += 1;
        const midpointX = (2 * candidate.grid.q[cell]! + candidate.grid.r[cell]!)
          + (2 * candidate.grid.q[neighbor]! + candidate.grid.r[neighbor]!)
          - 2 * centerX;
        const midpointR = candidate.grid.r[cell]! + candidate.grid.r[neighbor]! - 2 * centerR;
        const deltaQ = candidate.grid.q[neighbor]! - candidate.grid.q[cell]!;
        const deltaR = candidate.grid.r[neighbor]! - candidate.grid.r[cell]!;
        const edgeX = 2 * deltaQ + deltaR;
        const dot = midpointX * edgeX + 3 * midpointR * deltaR;
        const radialNorm = midpointX * midpointX + 3 * midpointR * midpointR;
        const edgeNorm = edgeX * edgeX + 3 * deltaR * deltaR;
        if (
          BigInt(dot) * BigInt(dot) * 100n
          <= BigInt(radialNorm) * BigInt(edgeNorm) * 16n
        ) radialTierOneBoundaryEdges += 1;
      }
    }
    const tierRadialAgreementBasisPoints = Math.round((
      [...radialTiers.values()].reduce((total, tiers) => total + Math.max(...tiers), 0)
      * 10_000
    ) / candidate.grid.cellCount);
    const radialTierOneBoundaryShareBasisPoints = Math.round(
      (radialTierOneBoundaryEdges * 10_000) / tierOneBoundaryEdges,
    );

    const landCells = Array.from({ length: candidate.grid.cellCount }, (_, cell) => cell)
      .filter(cell => (
        [0, 3, 4].includes(candidate.waterRegime[cell]!)
        && candidate.elevation[cell]! > 0
        && candidate.legacyLowlandsProtectedCell[cell] !== 1
      ));
    const elevations = landCells.map(cell => candidate.elevation[cell]!)
      .sort((first, second) => first - second);
    const uplifts = landCells.map(cell => candidate.tectonicUplift[cell]!)
      .sort((first, second) => first - second);
    const elevationThreshold = elevations[Math.floor(elevations.length * 0.58)]!;
    const upliftThreshold = uplifts[Math.floor(uplifts.length * 0.58)]!;
    const barrierCells = Array.from({ length: candidate.grid.cellCount }, (_, cell) => cell)
      .filter(cell => candidate.barrier[cell] === 1);
    const highlandCells = barrierCells.filter(cell => (
      candidate.elevation[cell]! >= elevationThreshold
      || candidate.tectonicUplift[cell]! >= upliftThreshold
    ));
    const highlandBarrierShareBasisPoints = Math.round(
      (highlandCells.length * 10_000) / barrierCells.length,
    );
    const mean = (values: readonly number[]) => Math.floor(
      values.reduce((total, value) => total + value, 0) / values.length,
    );
    const barrierMeanElevationAdvantage = mean(
      barrierCells.map(cell => candidate.elevation[cell]!),
    ) - mean(elevations);
    const barrierMeanUpliftAdvantage = mean(
      barrierCells.map(cell => candidate.tectonicUplift[cell]!),
    ) - mean(uplifts);

    expect(candidate.privateMetrics).toMatchObject({
      tierRadialAgreementBasisPoints,
      radialTierOneBoundaryShareBasisPoints,
      highlandBarrierShareBasisPoints,
      barrierMeanElevationAdvantage,
      barrierMeanUpliftAdvantage,
      gateRouteRedundancyProof: true,
    });
    expect(candidate.privateMetrics.measuredMinimumBarrierWidth).toBeGreaterThanOrEqual(4);
    expect(candidate.privateMetrics.measuredMaximumBarrierWidth).toBeLessThanOrEqual(8);
    expect(candidate.privateMetrics.measuredMaximumBarrierWidth)
      .toBeGreaterThanOrEqual(candidate.privateMetrics.measuredMinimumBarrierWidth);
    expect(tierRadialAgreementBasisPoints).toBeLessThanOrEqual(9_200);
    expect(radialTierOneBoundaryShareBasisPoints).toBeLessThanOrEqual(4_500);
    expect(highlandBarrierShareBasisPoints).toBeGreaterThanOrEqual(6_500);
    expect(
      barrierMeanElevationAdvantage >= 300 || barrierMeanUpliftAdvantage >= 100,
    ).toBe(true);
    expect(candidate.aggregate.proofs.naturalStrategicRegions).toBe(true);
    expect(candidate.aggregate.proofs.geologicalHighlandBarriers).toBe(true);
  });

  it('keeps each sealed gate connected to a substantial dry approach in its own region', () => {
    const candidate = requirePinned();
    const topology = auditPassableRegions(candidate);
    const robust = auditRobustRegions(candidate);
    const coreArticulationCounts = inducedCoreArticulationCounts(
      candidate.grid.neighbors,
      robust,
      64,
    );
    let acceptedCoreCount = 0;
    for (let component = 0; component < robust.componentSizes.length; component += 1) {
      if (robust.componentSizes[component]! < 64) continue;
      acceptedCoreCount += 1;
      expect(
        robust.componentCells[component],
        `robust core ${component} has its complete vertex inventory`,
      ).toHaveLength(robust.componentSizes[component]);
      expect(
        coreArticulationCounts[component],
        `robust core ${component} is articulation-free in its induced graph`,
      ).toBe(0);
    }
    expect(acceptedCoreCount).toBeGreaterThan(0);

    expect(candidate.gates.length).toBe(EXPECTED_SEALED_GATE_COUNT);
    expect(candidate.aggregate.gateCount).toBe(candidate.gates.length);
    for (const gate of candidate.gates) {
      expect(Array.from({ length: HEX_NEIGHBOR_COUNT }, (_, direction) => (
        candidate.grid.neighbors[gate.firstCell * HEX_NEIGHBOR_COUNT + direction]
      ))).toContain(gate.secondCell);
      for (const [endpoint, region, primary, alternate] of [
        [
          gate.firstCell,
          gate.firstRegion,
          gate.firstApproachPath,
          gate.firstAlternateApproachPath,
        ],
        [
          gate.secondCell,
          gate.secondRegion,
          gate.secondApproachPath,
          gate.secondAlternateApproachPath,
        ],
      ] as const) {
        expect(candidate.regionId[endpoint]).toBe(region);
        expect(candidate.waterRegime[endpoint]).toBe(0);
        expect(candidate.barrier[endpoint]).toBe(1);
        const validApproaches: number[] = [];
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = candidate.grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0) continue;
          const component = topology.componentId[neighbor]!;
          if (
            candidate.regionId[neighbor] === region
            && candidate.waterRegime[neighbor] === 0
            && candidate.barrier[neighbor] === 0
            && component >= 0
            && topology.componentSizes[component]! >= 64
          ) validApproaches.push(neighbor);
        }
        expect(validApproaches.length).toBeGreaterThanOrEqual(1);
        expect(primary[0]).not.toBe(alternate[0]);
        expect(primary.every(cell => !alternate.includes(cell))).toBe(true);
        const targetComponents: number[] = [];
        for (const path of [primary, alternate]) {
          expect(path.length).toBeGreaterThan(0);
          expect(new Set(path).size).toBe(path.length);
          expect(Array.from({ length: HEX_NEIGHBOR_COUNT }, (_, direction) => (
            candidate.grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]
          ))).toContain(path[0]);
          for (let index = 0; index < path.length; index += 1) {
            const cell = path[index]!;
            expect(candidate.regionId[cell]).toBe(region);
            expect(candidate.waterRegime[cell]).toBe(0);
            expect(candidate.barrier[cell]).toBe(0);
            if (index > 0) {
              expect(Array.from({ length: HEX_NEIGHBOR_COUNT }, (_, direction) => (
                candidate.grid.neighbors[path[index - 1]! * HEX_NEIGHBOR_COUNT + direction]
              ))).toContain(cell);
            }
          }
          const targetComponent = robust.componentId[path[path.length - 1]!]!;
          expect(targetComponent).toBeGreaterThanOrEqual(0);
          expect(robust.componentSizes[targetComponent]).toBeGreaterThanOrEqual(64);
          targetComponents.push(targetComponent);
        }
        expect(new Set(targetComponents).size).toBe(1);
      }
    }
    expect(candidate.aggregate.proofs.gateApproaches).toBe(true);
  });

  it('keeps a cycle core intact when an articulation-owned leaf is attached', () => {
    const cycleSize = 100;
    const leaf = cycleSize;
    const cellCount = cycleSize + 1;
    const neighbors = new Int32Array(cellCount * HEX_NEIGHBOR_COUNT);
    neighbors.fill(-1);
    const connect = (first: number, second: number) => {
      const firstOffset = first * HEX_NEIGHBOR_COUNT;
      const secondOffset = second * HEX_NEIGHBOR_COUNT;
      const firstSlot = Array.from(
        { length: HEX_NEIGHBOR_COUNT },
        (_, direction) => direction,
      ).find(direction => neighbors[firstOffset + direction] === -1);
      const secondSlot = Array.from(
        { length: HEX_NEIGHBOR_COUNT },
        (_, direction) => direction,
      ).find(direction => neighbors[secondOffset + direction] === -1);
      if (firstSlot === undefined || secondSlot === undefined) {
        throw new Error('GREATER_REALM_SYNTHETIC_GRAPH_DEGREE_EXCEEDED');
      }
      neighbors[firstOffset + firstSlot] = second;
      neighbors[secondOffset + secondSlot] = first;
    };
    for (let cell = 0; cell < cycleSize; cell += 1) {
      connect(cell, (cell + 1) % cycleSize);
    }
    connect(0, leaf);
    const synthetic = {
      grid: { cellCount, neighbors },
      regionId: new Uint8Array(cellCount),
      waterRegime: new Uint8Array(cellCount),
      barrier: new Uint8Array(cellCount),
    } as unknown as GreaterRealmPrivateCandidate;

    const robust = auditRobustRegions(synthetic);
    const cycleComponent = robust.componentId[0]!;
    expect(robust.articulation[0]).toBe(1);
    expect(cycleComponent).toBeGreaterThanOrEqual(0);
    expect(robust.componentSizes[cycleComponent]).toBe(cycleSize);
    for (let cell = 0; cell < cycleSize; cell += 1) {
      expect(robust.componentId[cell], `cycle cell ${cell}`).toBe(cycleComponent);
    }
    expect(robust.componentId[leaf]).toBe(-1);
    const articulationCounts = inducedCoreArticulationCounts(neighbors, robust, 64);
    expect(articulationCounts[cycleComponent]).toBe(0);
  });

  it('opens exactly the 18 declared physical gate edges and no side entrances', () => {
    const candidate = requirePinned();
    const endpointMate = new Map<number, number>();
    const declaredEdges = new Set<string>();
    for (const gate of candidate.gates) {
      endpointMate.set(gate.firstCell, gate.secondCell);
      endpointMate.set(gate.secondCell, gate.firstCell);
      declaredEdges.add([
        Math.min(gate.firstCell, gate.secondCell),
        Math.max(gate.firstCell, gate.secondCell),
      ].join(':'));
    }
    const openedEdges = new Set<string>();
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor <= cell
          || candidate.tierId[cell] === candidate.tierId[neighbor]
          || ![0, 3, 4].includes(candidate.waterRegime[cell]!)
          || ![0, 3, 4].includes(candidate.waterRegime[neighbor]!)
          || (candidate.barrier[cell] === 1 && !endpointMate.has(cell))
          || (candidate.barrier[neighbor] === 1 && !endpointMate.has(neighbor))
        ) continue;
        openedEdges.add(`${cell}:${neighbor}`);
      }
    }
    expect([...openedEdges].sort()).toEqual([...declaredEdges].sort());
    expect(openedEdges.size).toBe(EXPECTED_SEALED_GATE_COUNT);

    for (const gate of candidate.gates) {
      let crossings = 0;
      for (const endpoint of [gate.firstCell, gate.secondCell]) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = candidate.grid.neighbors[
            endpoint * HEX_NEIGHBOR_COUNT + direction
          ]!;
          if (
            neighbor >= 0
            && candidate.tierId[endpoint] !== candidate.tierId[neighbor]
            && [0, 3, 4].includes(candidate.waterRegime[neighbor]!)
            && (candidate.barrier[neighbor] === 0
              || neighbor === gate.firstCell
              || neighbor === gate.secondCell)
          ) crossings += 1;
        }
      }
      expect(crossings / 2, `gate ${gate.gateIndex}`).toBe(1);
    }
  });

  it('materializes exact distance-field mountain bands with 4–8-cell local normals', () => {
    const candidate = requirePinned();
    const outerBoundary = new Uint8Array(candidate.grid.cellCount);
    const innerBoundary = new Uint8Array(candidate.grid.cellCount);
    const expectedPairs = new Set(candidate.gateGraph.map(
      ([firstRegion, secondRegion]) => `${firstRegion}:${secondRegion}`,
    ));
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor <= cell || candidate.tierId[cell] === candidate.tierId[neighbor]) continue;
        const boundary = Math.min(candidate.tierId[cell]!, candidate.tierId[neighbor]!) === 1
          ? outerBoundary
          : innerBoundary;
        boundary[cell] = 1;
        boundary[neighbor] = 1;
      }
    }
    const tierDistance = (starts: Uint8Array): Uint16Array => {
      const distance = new Uint16Array(candidate.grid.cellCount);
      distance.fill(DISTANCE_UNREACHED);
      const queue = new Uint32Array(candidate.grid.cellCount);
      let head = 0;
      let tail = 0;
      for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
        if (starts[cell] !== 1) continue;
        distance[cell] = 0;
        queue[tail++] = cell;
      }
      while (head < tail) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || candidate.tierId[neighbor] !== candidate.tierId[cell]
            || distance[neighbor] !== DISTANCE_UNREACHED
          ) continue;
          distance[neighbor] = distance[cell]! + 1;
          queue[tail++] = neighbor;
        }
      }
      return distance;
    };
    const outerDistance = tierDistance(outerBoundary);
    const innerDistance = tierDistance(innerBoundary);
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const expectedBand = candidate.legacyLowlandsProtectedCell[cell] === 1
        ? 0
        : (outerDistance[cell]! < 2 ? 1 : 0) | (innerDistance[cell]! < 3 ? 2 : 0);
      expect(candidate.geologicalBarrierBand[cell], `band cell ${cell}`).toBe(expectedBand);
      if (candidate.barrier[cell] === 1) expect(expectedBand).not.toBe(0);
    }
    const normalDepth = (system: 1 | 2): Uint16Array => {
      const depth = new Uint16Array(candidate.grid.cellCount);
      depth.fill(DISTANCE_UNREACHED);
      const queue = new Uint32Array(candidate.grid.cellCount);
      let head = 0;
      let tail = 0;
      for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
        if ((candidate.geologicalBarrierBand[cell]! & system) === 0) continue;
        let hasTierExit = false;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && candidate.tierId[neighbor] === candidate.tierId[cell]
            && candidate.legacyLowlandsProtectedCell[neighbor] !== 1
            && (candidate.geologicalBarrierBand[neighbor]! & system) === 0
          ) {
            hasTierExit = true;
            break;
          }
        }
        if (!hasTierExit) continue;
        depth[cell] = 1;
        queue[tail++] = cell;
      }
      while (head < tail) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || candidate.tierId[neighbor] !== candidate.tierId[cell]
            || depth[neighbor] !== DISTANCE_UNREACHED
            || (candidate.geologicalBarrierBand[neighbor]! & system) === 0
          ) continue;
          depth[neighbor] = depth[cell]! + 1;
          queue[tail++] = neighbor;
        }
      }
      return depth;
    };
    const outerDepth = normalDepth(1);
    const innerDepth = normalDepth(2);
    const actualEdges = new Set<string>();
    const witnessedPairs = new Set<string>();
    let minimumWidth = Number.POSITIVE_INFINITY;
    let maximumWidth = 0;
    for (const crossSection of candidate.barrierCrossSections) {
      const edgeKey = [
        Math.min(crossSection.firstCell, crossSection.secondCell),
        Math.max(crossSection.firstCell, crossSection.secondCell),
      ].join(':');
      expect(actualEdges.has(edgeKey), edgeKey).toBe(false);
      actualEdges.add(edgeKey);
      const witnessedPair = [
        Math.min(
          candidate.regionId[crossSection.firstCell]!,
          candidate.regionId[crossSection.secondCell]!,
        ),
        Math.max(
          candidate.regionId[crossSection.firstCell]!,
          candidate.regionId[crossSection.secondCell]!,
        ),
      ].join(':');
      if (expectedPairs.has(witnessedPair)) witnessedPairs.add(witnessedPair);
      const depth = crossSection.system === 1 ? outerDepth : innerDepth;
      const measuredWidth = depth[crossSection.firstCell]!
        + depth[crossSection.secondCell]!;
      expect(measuredWidth).toBeGreaterThanOrEqual(4);
      expect(measuredWidth).toBeLessThanOrEqual(8);
      expect(crossSection.cells.length).toBe(measuredWidth);
      expect(crossSection.firstSideCellCount).toBe(depth[crossSection.firstCell]);
      expect(crossSection.cells[crossSection.firstSideCellCount - 1])
        .toBe(crossSection.firstCell);
      expect(crossSection.cells[crossSection.firstSideCellCount])
        .toBe(crossSection.secondCell);
      expect(crossSection.waterAssistedCellCount).toBe(crossSection.cells.filter(
        cell => ![0, 3, 4].includes(candidate.waterRegime[cell]!),
      ).length);
      minimumWidth = Math.min(minimumWidth, measuredWidth);
      maximumWidth = Math.max(maximumWidth, measuredWidth);
      for (let index = 0; index < crossSection.cells.length; index += 1) {
        const cell = crossSection.cells[index]!;
        const endpoint = index < crossSection.firstSideCellCount
          ? crossSection.firstCell
          : crossSection.secondCell;
        expect(candidate.legacyLowlandsProtectedCell[cell]).toBe(0);
        expect(candidate.geologicalBarrierBand[cell]! & crossSection.system)
          .toBe(crossSection.system);
        expect(candidate.tierId[cell]).toBe(candidate.tierId[endpoint]);
        if (index === 0) continue;
        const previous = crossSection.cells[index - 1]!;
        expect(Array.from({ length: HEX_NEIGHBOR_COUNT }, (_, direction) => (
          candidate.grid.neighbors[previous * HEX_NEIGHBOR_COUNT + direction]
        ))).toContain(cell);
      }
    }
    expect([...witnessedPairs].sort()).toEqual([...expectedPairs].sort());
    expect(minimumWidth).toBe(candidate.privateMetrics.measuredMinimumBarrierWidth);
    expect(maximumWidth).toBe(candidate.privateMetrics.measuredMaximumBarrierWidth);
  });

  it('meets per-region passable-land shares and makes Tier III the smallest passable region', () => {
    const candidate = requirePinned();
    const topology = auditPassableRegions(candidate);
    const thresholds = [8_000, 8_000, 8_000, 8_000, 5_500, 8_000, 8_500, 8_500, 8_500, 9_000];

    expect(topology.passableCounts.every(count => count > 0)).toBe(true);
    for (let region = 0; region < REGION_COUNT; region += 1) {
      expect(
        topology.largestSharesBasisPoints[region]!,
        `region ${region} largest passable share`,
      )
        .toBeGreaterThanOrEqual(thresholds[region]!);
    }
    const tierThreePassableCells = topology.passableCounts[TIER_III_REGION_INDEX]!;
    expect(topology.passableCounts.slice(0, TIER_III_REGION_INDEX).every(
      count => tierThreePassableCells < count,
    )).toBe(true);
    expect(candidate.privateMetrics.minimumLargestPassableRegionShareBasisPoints)
      .toBe(Math.min(...topology.largestSharesBasisPoints));
    expect(candidate.privateMetrics.tierThreePassableLandCells).toBe(tierThreePassableCells);
    expect(candidate.privateMetrics.smallestOtherRegionPassableLandCells).toBe(
      Math.min(...topology.passableCounts.slice(0, TIER_III_REGION_INDEX)),
    );
    expect(candidate.aggregate.proofs.regionPassableLand).toBe(true);
  });

  it('bounds minor fragments, thin boundaries, and one-cell tendrils per region', () => {
    const candidate = requirePinned();
    const topology = auditPassableRegions(candidate);
    const componentRegion = Array<number>(topology.componentSizes.length).fill(-1);
    const minorCells = Array<number>(REGION_COUNT).fill(0);
    const boundarySides = Array<number>(REGION_COUNT).fill(0);
    const tendrilCells = Array<number>(REGION_COUNT).fill(0);
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const component = topology.componentId[cell]!;
      if (component >= 0 && componentRegion[component] === -1) {
        componentRegion[component] = candidate.regionId[cell]!;
      }
      if (component < 0) continue;
      const region = candidate.regionId[cell]!;
      let sameNeighbors = 0;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && topology.componentId[neighbor]! >= 0
          && candidate.regionId[neighbor] === region
        ) sameNeighbors += 1;
        else boundarySides[region] += 1;
      }
      if (sameNeighbors <= 1) tendrilCells[region] += 1;
    }
    for (let component = 0; component < topology.componentSizes.length; component += 1) {
      if (topology.componentSizes[component]! >= 64) continue;
      minorCells[componentRegion[component]!] += topology.componentSizes[component]!;
    }
    const minorShares = topology.passableCounts.map((count, region) => Math.round(
      (minorCells[region]! * 10_000) / count,
    ));
    const boundaryDensities = topology.passableCounts.map((count, region) => Math.round(
      (boundarySides[region]! * 10_000) / (count * HEX_NEIGHBOR_COUNT),
    ));
    const tendrilShares = topology.passableCounts.map((count, region) => Math.round(
      (tendrilCells[region]! * 10_000) / count,
    ));

    expect(candidate.privateMetrics.minorPassableFragmentSharesBasisPoints).toEqual(minorShares);
    expect(candidate.privateMetrics.passableBoundaryDensityBasisPoints)
      .toEqual(boundaryDensities);
    expect(candidate.privateMetrics.passableTendrilSharesBasisPoints).toEqual(tendrilShares);
    expect(minorShares.every((share, region) => share <= (region === 4 ? 500 : 300)))
      .toBe(true);
    expect(boundaryDensities.every(share => share <= 1_000)).toBe(true);
    expect(tendrilShares.every(share => share <= 150)).toBe(true);
    expect(candidate.aggregate.proofs.regionLandCoherence).toBe(true);
  });

  it('recomputes every published final hydrology count and proves surface consistency', () => {
    const candidate = requirePinned();
    const ocean = new Uint8Array(candidate.grid.cellCount);
    const sea = new Uint8Array(candidate.grid.cellCount);
    const lake = new Uint8Array(candidate.grid.cellCount);
    const generatedMajorRiver = new Uint8Array(candidate.grid.cellCount);
    let invalidWaterRegimes = 0;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      if (candidate.waterRegime[cell] === 1) ocean[cell] = 1;
      if (candidate.waterRegime[cell] === 5) sea[cell] = 1;
      if (candidate.waterRegime[cell] === 2) lake[cell] = 1;
      if (candidate.waterRegime[cell]! > 5) invalidWaterRegimes += 1;
      if (
        candidate.legacyLowlandsProtectedCell[cell] !== 1
        && candidate.elevation[cell]! > 0
        && candidate.flowAccumulation[cell]! >= EXPECTED_MAJOR_RIVER_DISCHARGE
      ) generatedMajorRiver[cell] = 1;
    }
    const oceanComponents = auditComponents(candidate, ocean);
    const seaComponents = auditComponents(candidate, sea);
    const lakeComponents = auditComponents(candidate, lake);
    const majorRiverComponents = auditComponents(candidate, generatedMajorRiver);
    const landlockedOceanComponents = oceanComponents.touchesBoundary.filter(
      touchesBoundary => !touchesBoundary,
    ).length;
    const majorOceanSeaBodies = oceanComponents.sizes.length + seaComponents.sizes.length;
    const lakes = lakeComponents.sizes.filter(size => size >= 2).length;
    let minorStreams = 0;
    let watersheds = 0;
    let generatedWaterDrainingIntoDrySurface = 0;
    let dryOutlets = 0;
    const derivedSurface = (cell: number): number => (
      candidate.elevation[cell]! <= 0 ? 0 : candidate.filledElevation[cell]!
    );
    const auditStandingWater = (components: ComponentAudit) => {
      const surfaces = components.sizes.map(() => new Set<number>());
      const hasLegalSpillOrTerminal = components.sizes.map(() => false);
      for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
        const component = components.componentId[cell]!;
        if (component < 0) continue;
        const surface = derivedSurface(cell);
        surfaces[component]!.add(surface);
        const receiver = candidate.flowReceiver[cell]!;
        if (
          (receiver === -1 && surface === 0)
          || (
            receiver >= 0
            && components.componentId[receiver] !== component
            && derivedSurface(receiver) <= surface
          )
        ) hasLegalSpillOrTerminal[component] = true;
      }
      return Object.freeze({
        inconsistentSurfaces: surfaces.filter(values => values.size !== 1).length,
        componentsWithoutLegalSpillOrTerminal: hasLegalSpillOrTerminal.filter(
          value => !value,
        ).length,
      });
    };
    const seaSurfaceAudit = auditStandingWater(seaComponents);
    const lakeSurfaceAudit = auditStandingWater(lakeComponents);

    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      const receiver = candidate.flowReceiver[cell]!;
      if (receiver < 0) {
        if (candidate.flowAccumulation[cell]! >= 64n) watersheds += 1;
        if (candidate.waterRegime[cell] === 0) dryOutlets += 1;
      }
      if (candidate.legacyLowlandsProtectedCell[cell] === 1) continue;
      if (candidate.waterRegime[cell] === 4) {
        let hasUpstreamStream = false;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && candidate.waterRegime[neighbor] === 4
            && candidate.flowReceiver[neighbor] === cell
          ) {
            hasUpstreamStream = true;
            break;
          }
        }
        if (!hasUpstreamStream) minorStreams += 1;
      }
      if (
        (candidate.waterRegime[cell] === 3 || candidate.waterRegime[cell] === 4)
        && receiver >= 0
        && candidate.legacyLowlandsProtectedCell[receiver] !== 1
        && candidate.waterRegime[receiver] === 0
      ) generatedWaterDrainingIntoDrySurface += 1;
    }

    expect(candidate.aggregate.hydrology).toEqual({
      majorOceanSeaBodies,
      majorRivers: majorRiverComponents.sizes.length,
      minorStreams,
      lakes,
    });
    expect(candidate.aggregate.geology.watersheds).toBe(watersheds);
    expect(invalidWaterRegimes).toBe(0);
    expect(seaComponents.sizes.length).toBeGreaterThan(0);
    expect(landlockedOceanComponents).toBe(0);
    expect(generatedWaterDrainingIntoDrySurface).toBe(0);
    expect(dryOutlets).toBe(0);
    expect(seaSurfaceAudit.inconsistentSurfaces).toBe(0);
    expect(seaSurfaceAudit.componentsWithoutLegalSpillOrTerminal).toBe(0);
    expect(lakeSurfaceAudit.inconsistentSurfaces).toBe(0);
    expect(lakeSurfaceAudit.componentsWithoutLegalSpillOrTerminal).toBe(0);
    expect(candidate.aggregate.proofs.hydrologySurfaceConsistency).toBe(true);
  });

  it('keeps enabled legacy water nonpositive and every protected nonwater cell positive', () => {
    const candidate = requirePinned();
    const coordinateIndex = new Map<string, number>();
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      coordinateIndex.set(coordinateKey(candidate.grid.q[cell]!, candidate.grid.r[cell]!), cell);
    }
    const enabledWater = new Set<number>();
    const enabledWaterByKey = new Map(
      GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells.map(
        waterCell => [waterCell.cellKey, waterCell] as const,
      ),
    );
    for (const legacyWaterCell of GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells) {
      const global = transformLegacyLowlandsToGlobal(
        legacyWaterCell,
        candidate.legacyLowlandsTransform,
      );
      const cell = coordinateIndex.get(coordinateKey(global.q, global.r)) ?? -1;
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(candidate.legacyLowlandsProtectedCell[cell]).toBe(1);
      expect(candidate.elevation[cell]).toBeLessThanOrEqual(0);
      expect(candidate.waterRegime[cell]).toBe(
        legacyWaterCell.regime === 'ocean' ? 1 : legacyWaterCell.regime === 'lake' ? 2 : 3,
      );
      if (legacyWaterCell.regime === 'river') {
        const downstreamWaterCell = legacyWaterCell.downstreamWaterCellKey === undefined
          ? undefined
          : enabledWaterByKey.get(legacyWaterCell.downstreamWaterCellKey);
        const expectedReceiver = downstreamWaterCell === undefined
          ? -1
          : coordinateIndex.get(coordinateKey(
            transformLegacyLowlandsToGlobal(
              downstreamWaterCell,
              candidate.legacyLowlandsTransform,
            ).q,
            transformLegacyLowlandsToGlobal(
              downstreamWaterCell,
              candidate.legacyLowlandsTransform,
            ).r,
          )) ?? -1;
        expect(candidate.flowReceiver[cell]).toBe(expectedReceiver);
      }
      enabledWater.add(cell);
    }
    expect(enabledWater.size).toBe(GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.waterEnabledCellCount);

    let protectedNonwaterCells = 0;
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      if (candidate.legacyLowlandsProtectedCell[cell] !== 1 || enabledWater.has(cell)) continue;
      protectedNonwaterCells += 1;
      expect(candidate.waterRegime[cell]).toBe(0);
      expect(candidate.elevation[cell]).toBeGreaterThan(0);
    }
    expect(protectedNonwaterCells).toBeGreaterThan(0);
    expect(candidate.aggregate.proofs.legacyLowlandsPreserved).toBe(true);
  });

  it('places all 500 new castles on separated, dry, reachable, gate-buffered land', () => {
    const candidate = requirePinned();
    const topology = auditPassableRegions(candidate);
    const gateMask = new Uint8Array(candidate.grid.cellCount);
    for (const gate of candidate.gates) {
      gateMask[gate.firstCell] = 1;
      gateMask[gate.secondCell] = 1;
    }
    const gateDistance = distanceFromMask(candidate, gateMask);
    const legacyCastles: number[] = [];
    const newCastles: number[] = [];
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      if (candidate.castleSlot[cell] !== 1) continue;
      if (candidate.legacyLowlandsCastleSlot[cell] === 1) legacyCastles.push(cell);
      else newCastles.push(cell);
    }
    const allCastles = [...legacyCastles, ...newCastles];

    expect(legacyCastles.length).toBe(GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotCount);
    expect(newCastles.length).toBe(500);
    expect(allCastles.length).toBe(600);
    for (const cell of newCastles) {
      const component = topology.componentId[cell]!;
      expect(candidate.waterRegime[cell]).toBe(0);
      expect(candidate.barrier[cell]).toBe(0);
      expect(candidate.tierId[cell]).toBe(1);
      expect(candidate.regionId[cell]).toBeGreaterThanOrEqual(1);
      expect(candidate.regionId[cell]).toBeLessThanOrEqual(5);
      expect(gateDistance[cell]).toBeGreaterThanOrEqual(3);
      expect(component).toBeGreaterThanOrEqual(0);
      expect(topology.componentSizes[component]!).toBeGreaterThanOrEqual(200);
      const passableNeighbors = Array.from(
        { length: HEX_NEIGHBOR_COUNT },
        (_, direction) => candidate.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!,
      ).filter(neighbor => (
        neighbor >= 0
        && candidate.regionId[neighbor] === candidate.regionId[cell]
        && candidate.waterRegime[neighbor] === 0
        && candidate.barrier[neighbor] === 0
        && topology.componentId[neighbor] === component
      ));
      expect(passableNeighbors.length).toBeGreaterThanOrEqual(4);
      for (const other of allCastles) {
        if (other === cell) continue;
        expect(axialDistance(
          candidate.grid.q[cell]!,
          candidate.grid.r[cell]!,
          candidate.grid.q[other]!,
          candidate.grid.r[other]!,
        )).toBeGreaterThanOrEqual(5);
      }
    }
    expect(candidate.aggregate.proofs.castleCapacity).toBe(true);
  });

  it('keeps exactly one dormant private throne anchor inside safe Tier III terrain', () => {
    const candidate = requirePinned();
    const anchors = [...candidate.throneAnchor]
      .map((value, cell) => value === 1 ? cell : -1)
      .filter(cell => cell >= 0);
    const barrierDistance = distanceFromMask(candidate, candidate.barrier);
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0]!;
    expect(candidate.regionId[anchor]).toBe(TIER_III_REGION_INDEX);
    expect(candidate.waterRegime[anchor]).toBe(0);
    expect(candidate.barrier[anchor]).toBe(0);
    expect(barrierDistance[anchor]).toBeGreaterThanOrEqual(4);
    expect(candidate.privateMetrics.throneAnchorBarrierClearance).toBe(barrierDistance[anchor]);
    expect(candidate.aggregate.proofs.dormantThroneAnchor).toBe(true);
  });

  it('conserves independently summed deposited sediment plus exported material', () => {
    const candidate = requirePinned();
    let depositedFromCells = 0;
    for (const depth of candidate.sedimentDepth) depositedFromCells += depth;

    expect(Number.isSafeInteger(depositedFromCells)).toBe(true);
    expect(depositedFromCells).toBe(candidate.privateMetrics.depositedMaterialUnits);
    expect(candidate.privateMetrics.erodedMaterialUnits).toBe(
      depositedFromCells + candidate.privateMetrics.exportedSedimentUnits,
    );
    expect(candidate.privateMetrics.erodedMaterialUnits).toBeGreaterThanOrEqual(0);
    expect(candidate.privateMetrics.depositedMaterialUnits).toBeGreaterThanOrEqual(0);
    expect(candidate.privateMetrics.exportedSedimentUnits).toBeGreaterThanOrEqual(0);
  });

  it('isolates deterministic replay from mutation of the exported canvas snapshot', () => {
    const candidate = requirePinned();
    const exposed = greaterRealmPrivateCanvas();
    const originalQ = exposed.q[0]!;
    const originalR = exposed.r[1]!;
    const originalNeighbor = exposed.neighbors[0]!;
    const root = pinnedRoot();
    let replay: GreaterRealmPrivateCandidate | undefined;
    try {
      exposed.q[0] = 123_456_789;
      exposed.r[1] = -123_456_789;
      exposed.neighbors[0] = exposed.cellCount + 17;
      replay = generateGreaterRealmCandidate({
        rootSeed: root,
        candidateOrdinal: PINNED_ORDINAL,
      });
      expect(replay.stageDigests).toEqual(candidate.stageDigests);
      expect(replay.barrierCrossSections).toEqual(candidate.barrierCrossSections);
      expect(replay.aggregate).toEqual(candidate.aggregate);
      expect(replay.privateMetrics).toEqual(candidate.privateMetrics);
      expect(replay.grid.q).toEqual(candidate.grid.q);
      expect(replay.grid.r).toEqual(candidate.grid.r);
      expect(replay.grid.neighbors).toEqual(candidate.grid.neighbors);
    } finally {
      exposed.q[0] = originalQ;
      exposed.r[1] = originalR;
      exposed.neighbors[0] = originalNeighbor;
      root.fill(0);
      if (replay) clearGreaterRealmCandidateSecret(replay);
    }
  }, 120_000);
});
