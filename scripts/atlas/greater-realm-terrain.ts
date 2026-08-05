import { Buffer, constants as bufferConstants } from 'node:buffer';
import { createHash } from 'node:crypto';

export const GREATER_REALM_TERRAIN_CORE_VERSION =
  'greater-realm-terrain-v1' as const;

export type AxialCoordinate = Readonly<{
  q: number;
  r: number;
}>;

/**
 * Four private 32-bit words keep the offline candidate seed space at 128 bits.
 *
 * Candidate generation uses a `Uint32Array` so those words can be overwritten
 * after the private package is written. The readonly tuple remains supported
 * for small deterministic fixtures.
 */
export type GreaterRealmTerrainSeed =
  number | readonly [number, number, number, number] | Uint32Array;

type GreaterRealmTerrainSeedWords = Readonly<ArrayLike<number>>;

export const GREATER_REALM_AXIAL_DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
] as const);

const INT32_MIN = -0x8000_0000;
const INT32_MAX = 0x7fff_ffff;
const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const UINT16_RANGE = 0x1_0000;
const THERMAL_TRANSFER_SCALE_MAX = 0xffff;
const MAX_OFFLINE_RELAXATION_PASSES = 10_000;
const NEIGHBOR_COUNT = GREATER_REALM_AXIAL_DIRECTIONS.length;

function fail(code: string): never {
  throw new Error(code);
}

function assertSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value)) fail(code);
}

function assertInt32(value: number, code: string): void {
  assertSafeInteger(value, code);
  if (value < INT32_MIN || value > INT32_MAX) fail(code);
}

function assertUint32(value: number, code: string): void {
  assertSafeInteger(value, code);
  if (value < 0 || value > UINT32_MAX) fail(code);
}

function checkedInt32(value: number, code: string): number {
  assertInt32(value, code);
  return value;
}

function checkedSafeSum(first: number, second: number, code: string): number {
  const sum = first + second;
  if (!Number.isSafeInteger(sum)) fail(code);
  return sum;
}

function roundDivide(numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    fail('GREATER_REALM_INTEGER_DIVISION_INVALID');
  }
  const sign = numerator < 0 ? -1 : 1;
  const magnitude = Math.abs(numerator);
  const quotient = Math.floor(magnitude / denominator);
  const remainder = magnitude % denominator;
  return sign * (quotient + (remainder * 2 >= denominator ? 1 : 0));
}

export function greaterRealmAxialKey(coordinate: AxialCoordinate): string {
  assertInt32(coordinate.q, 'GREATER_REALM_AXIAL_Q_INVALID');
  assertInt32(coordinate.r, 'GREATER_REALM_AXIAL_R_INVALID');
  return `${coordinate.q},${coordinate.r}`;
}

export function greaterRealmHexDistance(
  first: AxialCoordinate,
  second: AxialCoordinate = { q: 0, r: 0 },
): number {
  assertInt32(first.q, 'GREATER_REALM_AXIAL_Q_INVALID');
  assertInt32(first.r, 'GREATER_REALM_AXIAL_R_INVALID');
  assertInt32(second.q, 'GREATER_REALM_AXIAL_Q_INVALID');
  assertInt32(second.r, 'GREATER_REALM_AXIAL_R_INVALID');
  const q = first.q - second.q;
  const r = first.r - second.r;
  const s = -q - r;
  if (
    !Number.isSafeInteger(q) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(s)
  ) {
    fail('GREATER_REALM_AXIAL_DISTANCE_OVERFLOW');
  }
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
}

export function greaterRealmAxialNeighbors(
  coordinate: AxialCoordinate,
): readonly AxialCoordinate[] {
  assertInt32(coordinate.q, 'GREATER_REALM_AXIAL_Q_INVALID');
  assertInt32(coordinate.r, 'GREATER_REALM_AXIAL_R_INVALID');
  return GREATER_REALM_AXIAL_DIRECTIONS.map((direction) =>
    Object.freeze({
      q: checkedInt32(
        coordinate.q + direction.q,
        'GREATER_REALM_AXIAL_NEIGHBOR_OVERFLOW',
      ),
      r: checkedInt32(
        coordinate.r + direction.r,
        'GREATER_REALM_AXIAL_NEIGHBOR_OVERFLOW',
      ),
    }),
  );
}

export type IndexedAxialGrid = Readonly<{
  cellCount: number;
  q: Int32Array;
  r: Int32Array;
  /** Six canonical neighbor slots per cell; `-1` means outside the active mask. */
  neighbors: Int32Array;
  indexOf: (coordinate: AxialCoordinate) => number;
  /** Best-effort removal of the private coordinate lookup when an atlas is retired. */
  clearIndex?: () => void;
}>;

/**
 * Canonically index an arbitrary six-connected active mask.
 *
 * Coordinates are sorted independently of caller order so every downstream
 * queue tie-break, digest, and counter-addressed field has one stable index.
 */
export function indexGreaterRealmAxialGrid(
  coordinates: readonly AxialCoordinate[],
): IndexedAxialGrid {
  if (coordinates.length === 0 || coordinates.length > INT32_MAX) {
    fail('GREATER_REALM_AXIAL_GRID_SIZE_INVALID');
  }
  const canonical = coordinates
    .map((coordinate) => {
      assertInt32(coordinate.q, 'GREATER_REALM_AXIAL_Q_INVALID');
      assertInt32(coordinate.r, 'GREATER_REALM_AXIAL_R_INVALID');
      return { q: coordinate.q, r: coordinate.r };
    })
    .sort((first, second) => first.q - second.q || first.r - second.r);

  const q = new Int32Array(canonical.length);
  const r = new Int32Array(canonical.length);
  const indexByKey = new Map<string, number>();
  for (let index = 0; index < canonical.length; index += 1) {
    const coordinate = canonical[index]!;
    const key = `${coordinate.q},${coordinate.r}`;
    if (indexByKey.has(key)) fail('GREATER_REALM_AXIAL_COORDINATE_DUPLICATE');
    q[index] = coordinate.q;
    r[index] = coordinate.r;
    indexByKey.set(key, index);
  }

  const neighbors = new Int32Array(canonical.length * NEIGHBOR_COUNT);
  neighbors.fill(-1);
  for (let index = 0; index < canonical.length; index += 1) {
    for (
      let directionIndex = 0;
      directionIndex < NEIGHBOR_COUNT;
      directionIndex += 1
    ) {
      const direction = GREATER_REALM_AXIAL_DIRECTIONS[directionIndex]!;
      const neighborQ = checkedInt32(
        q[index]! + direction.q,
        'GREATER_REALM_AXIAL_NEIGHBOR_OVERFLOW',
      );
      const neighborR = checkedInt32(
        r[index]! + direction.r,
        'GREATER_REALM_AXIAL_NEIGHBOR_OVERFLOW',
      );
      neighbors[index * NEIGHBOR_COUNT + directionIndex] =
        indexByKey.get(`${neighborQ},${neighborR}`) ?? -1;
    }
  }

  return Object.freeze({
    cellCount: canonical.length,
    q,
    r,
    neighbors,
    indexOf(coordinate: AxialCoordinate) {
      assertInt32(coordinate.q, 'GREATER_REALM_AXIAL_Q_INVALID');
      assertInt32(coordinate.r, 'GREATER_REALM_AXIAL_R_INVALID');
      return indexByKey.get(`${coordinate.q},${coordinate.r}`) ?? -1;
    },
    clearIndex() {
      indexByKey.clear();
    },
  });
}

function avalancheUint32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function terrainSeedWords(
  seed: GreaterRealmTerrainSeed,
): GreaterRealmTerrainSeedWords {
  if (typeof seed === 'number') {
    assertUint32(seed, 'GREATER_REALM_TERRAIN_SEED_INVALID');
    return [seed, 0, 0, 0];
  }
  if (seed.length !== 4) fail('GREATER_REALM_TERRAIN_SEED_INVALID');
  for (const word of seed)
    assertUint32(word, 'GREATER_REALM_TERRAIN_SEED_INVALID');
  return seed;
}

function rotateLeftUint32(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function counterRandomFromSeedWords(
  seed: GreaterRealmTerrainSeedWords,
  channel: number,
  q: number,
  r: number,
  sampleIndex = 0,
): number {
  let first = (seed[0] ^ 0x6170_7865 ^ channel) >>> 0;
  let second = (seed[1] ^ 0x3320_646e ^ (q >>> 0)) >>> 0;
  let third = (seed[2] ^ 0x7962_2d32 ^ (r >>> 0)) >>> 0;
  let fourth = (seed[3] ^ 0x6b20_6574 ^ sampleIndex) >>> 0;
  const initialFirst = first;
  const initialSecond = second;
  const initialThird = third;
  const initialFourth = fourth;

  // Integer ARX mixing keeps all four seed words live without mutable state.
  // This is a reproducibility primitive, not an authentication mechanism.
  for (let round = 0; round < 8; round += 1) {
    first = (first + second) >>> 0;
    fourth = rotateLeftUint32(fourth ^ first, 16);
    third = (third + fourth) >>> 0;
    second = rotateLeftUint32(second ^ third, 12);
    first = (first + second) >>> 0;
    fourth = rotateLeftUint32(fourth ^ first, 8);
    third = (third + fourth) >>> 0;
    second = rotateLeftUint32(second ^ third, 7);
    first = (first ^ Math.imul(round + 1, 0x9e37_79b9)) >>> 0;
  }

  first = (first + initialFirst) >>> 0;
  second = (second + initialSecond) >>> 0;
  third = (third + initialThird) >>> 0;
  fourth = (fourth + initialFourth) >>> 0;
  return avalancheUint32(first ^ second ^ third ^ fourth);
}

/** Stable FNV-1a identifier for named, independently addressable fields. */
export function greaterRealmTerrainChannelId(channel: string): number {
  if (channel.length === 0) fail('GREATER_REALM_TERRAIN_CHANNEL_INVALID');
  let hash = 0x811c_9dc5;
  for (let index = 0; index < channel.length; index += 1) {
    hash ^= channel.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return avalancheUint32(hash);
}

/**
 * Stateless integer randomness addressed by seed, channel, coordinate, and sample.
 * Adding a generation stage or traversing cells in another order cannot shift it.
 */
export function greaterRealmCounterRandomU32(
  seed: GreaterRealmTerrainSeed,
  channel: number,
  q: number,
  r: number,
  sampleIndex = 0,
): number {
  assertUint32(channel, 'GREATER_REALM_TERRAIN_CHANNEL_INVALID');
  assertInt32(q, 'GREATER_REALM_AXIAL_Q_INVALID');
  assertInt32(r, 'GREATER_REALM_AXIAL_R_INVALID');
  assertUint32(sampleIndex, 'GREATER_REALM_TERRAIN_SAMPLE_INVALID');

  return counterRandomFromSeedWords(
    terrainSeedWords(seed),
    channel,
    q,
    r,
    sampleIndex,
  );
}

export type IntegerFieldLayer = Readonly<{
  channel: string | number;
  amplitude: number;
  smoothingPasses: number;
  selfWeight?: number;
}>;

function layerChannelId(channel: string | number): number {
  if (typeof channel === 'string') return greaterRealmTerrainChannelId(channel);
  assertUint32(channel, 'GREATER_REALM_TERRAIN_CHANNEL_INVALID');
  return channel;
}

/**
 * Build an integer multi-scale field by independently sampling and smoothing
 * named layers. Smoothing is synchronous, mask-aware, and symmetric around 0.
 */
export function createGreaterRealmMultiscaleIntegerField(
  grid: IndexedAxialGrid,
  seed: GreaterRealmTerrainSeed,
  layers: readonly IntegerFieldLayer[],
): Int32Array {
  const seedWords = terrainSeedWords(seed);
  if (layers.length === 0) fail('GREATER_REALM_TERRAIN_LAYERS_EMPTY');
  const output = new Int32Array(grid.cellCount);
  let current: Int32Array | undefined;
  let next: Int32Array | undefined;
  let completed = false;
  try {
    for (const layer of layers) {
      assertInt32(layer.amplitude, 'GREATER_REALM_TERRAIN_AMPLITUDE_INVALID');
      if (layer.amplitude < 0) fail('GREATER_REALM_TERRAIN_AMPLITUDE_INVALID');
      assertUint32(
        layer.smoothingPasses,
        'GREATER_REALM_TERRAIN_SMOOTHING_INVALID',
      );
      if (layer.smoothingPasses > MAX_OFFLINE_RELAXATION_PASSES) {
        fail('GREATER_REALM_TERRAIN_SMOOTHING_INVALID');
      }
      const selfWeight = layer.selfWeight ?? 2;
      assertUint32(selfWeight, 'GREATER_REALM_TERRAIN_SELF_WEIGHT_INVALID');
      if (selfWeight === 0) fail('GREATER_REALM_TERRAIN_SELF_WEIGHT_INVALID');
      const channel = layerChannelId(layer.channel);
      const span = layer.amplitude * 2 + 1;
      if (
        !Number.isSafeInteger(span) ||
        0xffff * span > Number.MAX_SAFE_INTEGER
      ) {
        fail('GREATER_REALM_TERRAIN_AMPLITUDE_OVERFLOW');
      }

      current = new Int32Array(grid.cellCount);
      for (let index = 0; index < grid.cellCount; index += 1) {
        const random = counterRandomFromSeedWords(
          seedWords,
          channel,
          grid.q[index]!,
          grid.r[index]!,
        );
        const sample = random >>> 16;
        current[index] =
          Math.floor((sample * span) / UINT16_RANGE) - layer.amplitude;
      }

      for (let pass = 0; pass < layer.smoothingPasses; pass += 1) {
        next = new Int32Array(grid.cellCount);
        for (let index = 0; index < grid.cellCount; index += 1) {
          let numerator = current[index]! * selfWeight;
          let denominator = selfWeight;
          if (!Number.isSafeInteger(numerator))
            fail('GREATER_REALM_TERRAIN_SMOOTHING_OVERFLOW');
          for (
            let directionIndex = 0;
            directionIndex < NEIGHBOR_COUNT;
            directionIndex += 1
          ) {
            const neighbor =
              grid.neighbors[index * NEIGHBOR_COUNT + directionIndex]!;
            if (neighbor < 0) continue;
            numerator = checkedSafeSum(
              numerator,
              current[neighbor]!,
              'GREATER_REALM_TERRAIN_SMOOTHING_OVERFLOW',
            );
            denominator += 1;
          }
          next[index] = checkedInt32(
            roundDivide(numerator, denominator),
            'GREATER_REALM_TERRAIN_SMOOTHING_OVERFLOW',
          );
        }
        current.fill(0);
        current = next;
        next = undefined;
      }

      for (let index = 0; index < grid.cellCount; index += 1) {
        output[index] = checkedInt32(
          output[index]! + current[index]!,
          'GREATER_REALM_TERRAIN_FIELD_OVERFLOW',
        );
      }
      current.fill(0);
      current = undefined;
    }
    completed = true;
    return output;
  } finally {
    current?.fill(0);
    next?.fill(0);
    if (!completed) output.fill(0);
  }
}

class StableCellMinHeap {
  readonly #cells: number[] = [];

  constructor(private readonly priority: Int32Array) {}

  get size(): number {
    return this.#cells.length;
  }

  #less(first: number, second: number): boolean {
    const priorityDifference = this.priority[first]! - this.priority[second]!;
    return (
      priorityDifference < 0 || (priorityDifference === 0 && first < second)
    );
  }

  push(cell: number): void {
    let cursor = this.#cells.length;
    this.#cells.push(cell);
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2);
      if (!this.#less(cell, this.#cells[parent]!)) break;
      this.#cells[cursor] = this.#cells[parent]!;
      cursor = parent;
    }
    this.#cells[cursor] = cell;
  }

  pop(): number {
    if (this.#cells.length === 0) fail('GREATER_REALM_PRIORITY_QUEUE_EMPTY');
    const root = this.#cells[0]!;
    const tail = this.#cells.pop()!;
    if (this.#cells.length === 0) return root;

    let cursor = 0;
    while (true) {
      const left = cursor * 2 + 1;
      if (left >= this.#cells.length) break;
      const right = left + 1;
      let child = left;
      if (
        right < this.#cells.length &&
        this.#less(this.#cells[right]!, this.#cells[left]!)
      ) {
        child = right;
      }
      if (!this.#less(this.#cells[child]!, tail)) break;
      this.#cells[cursor] = this.#cells[child]!;
      cursor = child;
    }
    this.#cells[cursor] = tail;
    return root;
  }
}

export type GreaterRealmPriorityFlood = Readonly<{
  filledElevation: Int32Array;
  floodParent: Int32Array;
  /** Pop order by rank. */
  order: Uint32Array;
  /** Pop rank by cell index. */
  rank: Uint32Array;
  outlets: Uint8Array;
}>;

function canonicalOutletIndexes(
  grid: IndexedAxialGrid,
  outletIndexes: readonly number[] | Uint32Array | undefined,
): number[] {
  const outlets: number[] = [];
  if (outletIndexes === undefined) {
    for (let index = 0; index < grid.cellCount; index += 1) {
      for (
        let directionIndex = 0;
        directionIndex < NEIGHBOR_COUNT;
        directionIndex += 1
      ) {
        if (grid.neighbors[index * NEIGHBOR_COUNT + directionIndex] !== -1)
          continue;
        outlets.push(index);
        break;
      }
    }
  } else {
    for (const outlet of outletIndexes) {
      if (
        !Number.isSafeInteger(outlet) ||
        outlet < 0 ||
        outlet >= grid.cellCount
      ) {
        fail('GREATER_REALM_PRIORITY_FLOOD_OUTLET_INVALID');
      }
      outlets.push(outlet);
    }
  }
  outlets.sort((first, second) => first - second);
  const unique = outlets.filter(
    (outlet, index) => index === 0 || outlet !== outlets[index - 1],
  );
  if (unique.length === 0) fail('GREATER_REALM_PRIORITY_FLOOD_OUTLET_MISSING');
  return unique;
}

/** Stable Priority-Flood over a six-connected active mask. */
export function priorityFloodGreaterRealmHexGrid(
  grid: IndexedAxialGrid,
  elevation: Readonly<Int32Array>,
  outletIndexes?: readonly number[] | Uint32Array,
): GreaterRealmPriorityFlood {
  if (elevation.length !== grid.cellCount)
    fail('GREATER_REALM_ELEVATION_LENGTH_INVALID');
  if (grid.cellCount > UINT32_MAX)
    fail('GREATER_REALM_PRIORITY_FLOOD_SIZE_OVERFLOW');

  const filledElevation = new Int32Array(elevation);
  const floodParent = new Int32Array(grid.cellCount);
  floodParent.fill(-1);
  const order = new Uint32Array(grid.cellCount);
  const rank = new Uint32Array(grid.cellCount);
  const outlets = new Uint8Array(grid.cellCount);
  const discovered = new Uint8Array(grid.cellCount);
  const heap = new StableCellMinHeap(filledElevation);

  for (const outlet of canonicalOutletIndexes(grid, outletIndexes)) {
    outlets[outlet] = 1;
    discovered[outlet] = 1;
    heap.push(outlet);
  }

  let popCount = 0;
  while (heap.size > 0) {
    const cell = heap.pop();
    order[popCount] = cell;
    rank[cell] = popCount;
    popCount += 1;

    for (
      let directionIndex = 0;
      directionIndex < NEIGHBOR_COUNT;
      directionIndex += 1
    ) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor < 0 || discovered[neighbor] === 1) continue;
      discovered[neighbor] = 1;
      floodParent[neighbor] = cell;
      if (filledElevation[neighbor]! < filledElevation[cell]!) {
        filledElevation[neighbor] = filledElevation[cell]!;
      }
      heap.push(neighbor);
    }
  }

  if (popCount !== grid.cellCount)
    fail('GREATER_REALM_PRIORITY_FLOOD_UNREACHABLE');
  return Object.freeze({ filledElevation, floodParent, order, rank, outlets });
}

export type GreaterRealmSingleFlowRouting = Readonly<{
  /** One adjacent receiver per non-outlet; `-1` only for legal outlets. */
  receiver: Int32Array;
  order: Uint32Array;
  rank: Uint32Array;
  outlets: Uint8Array;
}>;

function betterFlowReceiver(
  candidate: number,
  currentBest: number,
  elevation: Int32Array,
  rank: Uint32Array,
): boolean {
  if (currentBest < 0) return true;
  if (elevation[candidate]! !== elevation[currentBest]!) {
    return elevation[candidate]! < elevation[currentBest]!;
  }
  if (rank[candidate]! !== rank[currentBest]!)
    return rank[candidate]! < rank[currentBest]!;
  return candidate < currentBest;
}

/**
 * Route one flow edge per cell. Lower filled terrain wins; filled flats follow
 * strictly decreasing flood rank, so every path terminates without epsilon edits.
 */
export function routeGreaterRealmSingleFlow(
  grid: IndexedAxialGrid,
  flood: GreaterRealmPriorityFlood,
): GreaterRealmSingleFlowRouting {
  if (
    flood.filledElevation.length !== grid.cellCount ||
    flood.order.length !== grid.cellCount ||
    flood.rank.length !== grid.cellCount ||
    flood.outlets.length !== grid.cellCount
  )
    fail('GREATER_REALM_FLOW_INPUT_LENGTH_INVALID');

  const receiver = new Int32Array(grid.cellCount);
  receiver.fill(-1);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (flood.outlets[cell] === 1) continue;
    let best = -1;
    for (
      let directionIndex = 0;
      directionIndex < NEIGHBOR_COUNT;
      directionIndex += 1
    ) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor < 0 || flood.rank[neighbor]! >= flood.rank[cell]!) continue;
      if (flood.filledElevation[neighbor]! > flood.filledElevation[cell]!)
        continue;
      if (betterFlowReceiver(neighbor, best, flood.filledElevation, flood.rank))
        best = neighbor;
    }
    if (best < 0) fail('GREATER_REALM_FLOW_RECEIVER_MISSING');
    receiver[cell] = best;
  }

  const routing = Object.freeze({
    receiver,
    order: new Uint32Array(flood.order),
    rank: new Uint32Array(flood.rank),
    outlets: new Uint8Array(flood.outlets),
  });
  assertGreaterRealmSingleFlow(grid, flood.filledElevation, routing);
  return routing;
}

/** Throw unless the routing is adjacent, downhill/flat, acyclic, and outlet-complete. */
export function assertGreaterRealmSingleFlow(
  grid: IndexedAxialGrid,
  filledElevation: Readonly<Int32Array>,
  routing: GreaterRealmSingleFlowRouting,
): void {
  if (
    filledElevation.length !== grid.cellCount ||
    routing.receiver.length !== grid.cellCount ||
    routing.order.length !== grid.cellCount ||
    routing.rank.length !== grid.cellCount ||
    routing.outlets.length !== grid.cellCount
  )
    fail('GREATER_REALM_FLOW_INPUT_LENGTH_INVALID');

  const seen = new Uint8Array(grid.cellCount);
  for (let orderIndex = 0; orderIndex < grid.cellCount; orderIndex += 1) {
    const cell = routing.order[orderIndex]!;
    if (
      cell >= grid.cellCount ||
      seen[cell] === 1 ||
      routing.rank[cell] !== orderIndex
    ) {
      fail('GREATER_REALM_FLOW_ORDER_INVALID');
    }
    seen[cell] = 1;
  }

  let outletCount = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const receiver = routing.receiver[cell]!;
    if (routing.outlets[cell] === 1) {
      outletCount += 1;
      if (receiver !== -1) fail('GREATER_REALM_FLOW_OUTLET_INVALID');
      continue;
    }
    if (receiver < 0 || receiver >= grid.cellCount)
      fail('GREATER_REALM_FLOW_RECEIVER_INVALID');
    let adjacent = false;
    for (
      let directionIndex = 0;
      directionIndex < NEIGHBOR_COUNT;
      directionIndex += 1
    ) {
      if (grid.neighbors[cell * NEIGHBOR_COUNT + directionIndex] === receiver) {
        adjacent = true;
        break;
      }
    }
    if (!adjacent) fail('GREATER_REALM_FLOW_RECEIVER_NOT_ADJACENT');
    if (filledElevation[receiver]! > filledElevation[cell]!)
      fail('GREATER_REALM_FLOW_UPHILL');
    if (routing.rank[receiver]! >= routing.rank[cell]!)
      fail('GREATER_REALM_FLOW_CYCLE');
  }
  if (outletCount === 0) fail('GREATER_REALM_FLOW_OUTLET_MISSING');
}

/** Accumulate non-negative local discharge in reverse topological order. */
export function accumulateGreaterRealmSingleFlow(
  grid: IndexedAxialGrid,
  filledElevation: Readonly<Int32Array>,
  routing: GreaterRealmSingleFlowRouting,
  localContribution?: Readonly<Uint32Array>,
): BigUint64Array {
  assertGreaterRealmSingleFlow(grid, filledElevation, routing);
  if (
    localContribution !== undefined &&
    localContribution.length !== grid.cellCount
  ) {
    fail('GREATER_REALM_FLOW_CONTRIBUTION_LENGTH_INVALID');
  }
  const accumulation = new BigUint64Array(grid.cellCount);
  let localTotal = 0n;
  for (let index = 0; index < grid.cellCount; index += 1) {
    const contribution = BigInt(localContribution?.[index] ?? 1);
    accumulation[index] = contribution;
    localTotal += contribution;
    if (localTotal > UINT64_MAX)
      fail('GREATER_REALM_FLOW_ACCUMULATION_OVERFLOW');
  }

  for (let orderIndex = grid.cellCount - 1; orderIndex >= 0; orderIndex -= 1) {
    const cell = routing.order[orderIndex]!;
    const receiver = routing.receiver[cell]!;
    if (receiver < 0) continue;
    const sum = accumulation[receiver]! + accumulation[cell]!;
    if (sum > UINT64_MAX) fail('GREATER_REALM_FLOW_ACCUMULATION_OVERFLOW');
    accumulation[receiver] = sum;
  }

  let outletTotal = 0n;
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (routing.outlets[index] === 1) outletTotal += accumulation[index]!;
  }
  if (outletTotal !== localTotal)
    fail('GREATER_REALM_FLOW_ACCUMULATION_MISMATCH');
  return accumulation;
}

export type SynchronousThermalErosionOptions = Readonly<{
  iterations: number;
  /** Maximum stable edge drop, globally or per cell. Per-edge uses the larger value. */
  talus: number | Readonly<Int32Array>;
  transferNumerator?: number;
  transferDenominator?: number;
}>;

export type SynchronousThermalErosionResult = Readonly<{
  elevation: Int32Array;
  initialMass: bigint;
  finalMass: bigint;
  movedMaterial: bigint;
}>;

function elevationMass(elevation: Readonly<Int32Array>): bigint {
  let mass = 0n;
  for (const value of elevation) mass += BigInt(value);
  return mass;
}

function talusAt(talus: number | Readonly<Int32Array>, index: number): number {
  return typeof talus === 'number' ? talus : talus[index]!;
}

/**
 * Conservative two-pass thermal relaxation. Every edge flux is calculated
 * from the same snapshot, then all deltas are committed together.
 */
export function erodeGreaterRealmThermally(
  grid: IndexedAxialGrid,
  elevation: Readonly<Int32Array>,
  options: SynchronousThermalErosionOptions,
): SynchronousThermalErosionResult {
  if (elevation.length !== grid.cellCount)
    fail('GREATER_REALM_ELEVATION_LENGTH_INVALID');
  assertUint32(options.iterations, 'GREATER_REALM_THERMAL_ITERATIONS_INVALID');
  if (options.iterations > MAX_OFFLINE_RELAXATION_PASSES) {
    fail('GREATER_REALM_THERMAL_ITERATIONS_INVALID');
  }
  if (typeof options.talus === 'number') {
    assertInt32(options.talus, 'GREATER_REALM_THERMAL_TALUS_INVALID');
    if (options.talus < 0) fail('GREATER_REALM_THERMAL_TALUS_INVALID');
  } else {
    if (options.talus.length !== grid.cellCount)
      fail('GREATER_REALM_THERMAL_TALUS_LENGTH_INVALID');
    for (const value of options.talus) {
      if (value < 0) fail('GREATER_REALM_THERMAL_TALUS_INVALID');
    }
  }
  const transferNumerator = options.transferNumerator ?? 1;
  const transferDenominator = options.transferDenominator ?? 16;
  assertUint32(transferNumerator, 'GREATER_REALM_THERMAL_TRANSFER_INVALID');
  assertUint32(transferDenominator, 'GREATER_REALM_THERMAL_TRANSFER_INVALID');
  if (
    transferNumerator === 0 ||
    transferDenominator === 0 ||
    transferNumerator > THERMAL_TRANSFER_SCALE_MAX ||
    transferDenominator > THERMAL_TRANSFER_SCALE_MAX ||
    transferNumerator * NEIGHBOR_COUNT > transferDenominator
  )
    fail('GREATER_REALM_THERMAL_TRANSFER_INVALID');

  const initialMass = elevationMass(elevation);
  let movedMaterial = 0n;
  let current = new Int32Array(elevation);
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const delta = new Float64Array(grid.cellCount);
    let movedThisIteration = 0;
    for (let first = 0; first < grid.cellCount; first += 1) {
      for (
        let directionIndex = 0;
        directionIndex < NEIGHBOR_COUNT;
        directionIndex += 1
      ) {
        const second = grid.neighbors[first * NEIGHBOR_COUNT + directionIndex]!;
        if (second <= first) continue;
        const difference = current[first]! - current[second]!;
        const magnitude = Math.abs(difference);
        const stableDrop = Math.max(
          talusAt(options.talus, first),
          talusAt(options.talus, second),
        );
        if (magnitude <= stableDrop) continue;
        const transfer = Math.floor(
          ((magnitude - stableDrop) * transferNumerator) / transferDenominator,
        );
        if (transfer <= 0) continue;
        const high = difference > 0 ? first : second;
        const low = difference > 0 ? second : first;
        delta[high] -= transfer;
        delta[low] += transfer;
        if (
          !Number.isSafeInteger(delta[high]) ||
          !Number.isSafeInteger(delta[low])
        ) {
          fail('GREATER_REALM_THERMAL_DELTA_OVERFLOW');
        }
        movedThisIteration = checkedSafeSum(
          movedThisIteration,
          transfer,
          'GREATER_REALM_THERMAL_TRANSFER_OVERFLOW',
        );
      }
    }

    const next = new Int32Array(grid.cellCount);
    for (let index = 0; index < grid.cellCount; index += 1) {
      next[index] = checkedInt32(
        current[index]! + delta[index]!,
        'GREATER_REALM_THERMAL_ELEVATION_OVERFLOW',
      );
    }
    movedMaterial += BigInt(movedThisIteration);
    current = next;
  }

  const finalMass = elevationMass(current);
  if (finalMass !== initialMass) fail('GREATER_REALM_THERMAL_MASS_MISMATCH');
  return Object.freeze({
    elevation: current,
    initialMass,
    finalMass,
    movedMaterial,
  });
}

export type IntegerTerrainArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array;

function updateLengthPrefixedText(
  digest: ReturnType<typeof createHash>,
  value: string,
): void {
  const encoded = Buffer.from(value, 'utf8');
  const size = Buffer.allocUnsafe(4);
  try {
    size.writeUInt32LE(encoded.length);
    digest.update(size);
    digest.update(encoded);
  } finally {
    size.fill(0);
    encoded.fill(0);
  }
}

function encodeIntegerArray(array: IntegerTerrainArray): Readonly<{
  type: string;
  bytes: Buffer;
}> {
  let type: string;
  let width: number;
  let write: (buffer: Buffer, offset: number, index: number) => void;
  if (array instanceof Int8Array) {
    type = 'i8';
    width = 1;
    write = (buffer, offset, index) => buffer.writeInt8(array[index]!, offset);
  } else if (array instanceof Uint8ClampedArray) {
    type = 'u8c';
    width = 1;
    write = (buffer, offset, index) => buffer.writeUInt8(array[index]!, offset);
  } else if (array instanceof Uint8Array) {
    type = 'u8';
    width = 1;
    write = (buffer, offset, index) => buffer.writeUInt8(array[index]!, offset);
  } else if (array instanceof Int16Array) {
    type = 'i16';
    width = 2;
    write = (buffer, offset, index) =>
      buffer.writeInt16LE(array[index]!, offset);
  } else if (array instanceof Uint16Array) {
    type = 'u16';
    width = 2;
    write = (buffer, offset, index) =>
      buffer.writeUInt16LE(array[index]!, offset);
  } else if (array instanceof Int32Array) {
    type = 'i32';
    width = 4;
    write = (buffer, offset, index) =>
      buffer.writeInt32LE(array[index]!, offset);
  } else if (array instanceof Uint32Array) {
    type = 'u32';
    width = 4;
    write = (buffer, offset, index) =>
      buffer.writeUInt32LE(array[index]!, offset);
  } else if (array instanceof BigInt64Array) {
    type = 'i64';
    width = 8;
    write = (buffer, offset, index) =>
      buffer.writeBigInt64LE(array[index]!, offset);
  } else if (array instanceof BigUint64Array) {
    type = 'u64';
    width = 8;
    write = (buffer, offset, index) =>
      buffer.writeBigUInt64LE(array[index]!, offset);
  } else {
    fail('GREATER_REALM_STAGE_DIGEST_ARRAY_INVALID');
  }
  if (
    array.length > UINT32_MAX ||
    array.length * width > bufferConstants.MAX_LENGTH
  ) {
    fail('GREATER_REALM_STAGE_DIGEST_ARRAY_TOO_LARGE');
  }
  const bytes = Buffer.allocUnsafe(array.length * width);
  try {
    for (let index = 0; index < array.length; index += 1)
      write(bytes, index * width, index);
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
  return Object.freeze({ type, bytes });
}

/**
 * SHA-256 over canonical coordinates and sorted integer fields. Values are
 * explicitly little-endian so evidence is not host-endian dependent.
 */
export function digestGreaterRealmTerrainStage(
  stage: string,
  grid: IndexedAxialGrid,
  fields: Readonly<Record<string, IntegerTerrainArray>>,
): string {
  if (stage.length === 0) fail('GREATER_REALM_STAGE_DIGEST_NAME_INVALID');
  const digest = createHash('sha256');
  updateLengthPrefixedText(digest, GREATER_REALM_TERRAIN_CORE_VERSION);
  updateLengthPrefixedText(digest, stage);
  const count = Buffer.allocUnsafe(4);
  try {
    count.writeUInt32LE(grid.cellCount);
    digest.update(count);

    if (
      Object.keys(fields).some(
        (name) => name.length === 0 || name.startsWith('@'),
      )
    ) {
      fail('GREATER_REALM_STAGE_DIGEST_FIELD_INVALID');
    }

    for (const [name, array] of [
      ['@q', grid.q] as const,
      ['@r', grid.r] as const,
      ...Object.entries(fields).sort(([first], [second]) =>
        first < second ? -1 : first > second ? 1 : 0,
      ),
    ]) {
      const encoded = encodeIntegerArray(array);
      let length: Buffer | undefined;
      try {
        updateLengthPrefixedText(digest, name);
        updateLengthPrefixedText(digest, encoded.type);
        length = Buffer.allocUnsafe(4);
        length.writeUInt32LE(array.length);
        digest.update(length);
        digest.update(encoded.bytes);
      } finally {
        length?.fill(0);
        encoded.bytes.fill(0);
      }
    }
    return digest.digest('hex');
  } finally {
    count.fill(0);
  }
}
