import type { Building04 } from './policy';

export type Placement04 = Readonly<{
  kind: Building04;
  x: bigint;
  z: bigint;
  rotation: number;
}>;

export type PlacementResult04 = Readonly<{
  valid: boolean;
  reason:
    | 'valid'
    | 'invalid'
    | 'off-grid'
    | 'rotation'
    | 'outside'
    | 'reserved'
    | 'occupied'
    | 'duplicate-kind'
    | 'invalid-state';
}>;

export const GAMEPLAY04_LAYOUT_VERSION = 'warpkeep-0.4-placement-v1';

const PRESENTATION_DIGEST = '533ff0c18624445af874f97b71d1d3ae4c6cb4a61f8b7732ba905ee10a61b443';
const SNAP = 500_000n;
const ROTATIONS = [0, 90_000, 180_000, 270_000] as const;
const SUPPORT = [-44_000_000n, 44_000_000n, -40_000_000n, 32_000_000n] as const;
const FOOTPRINTS = [
  ['city-mill', 5_650_000n, 4_750_000n],
  ['lumber-camp', 5_300_000n, 4_400_000n],
  ['city-stoneworks', 5_500_000n, 4_600_000n],
  ['city-goldworks', 5_500_000n, 4_600_000n],
  ['city-barracks', 9_250_000n, 7_750_000n],
  ['grand-covenant-cathedral', 18_500_000n, 16_010_000n],
] as const;
const EXCLUSIONS = [
  ['gate-spine', 0n, 14_500_000n, 3_000_000n, 17_500_000n],
  ['civic-commons', 0n, 2_000_000n, 5_000_000n, 5_000_000n],
  ['gate-approach', 0n, 30_000_000n, 4_000_000n, 2_000_000n],
] as const;

const I64_MIN = -9_223_372_036_854_775_808n;
const I64_MAX = 9_223_372_036_854_775_807n;
const PLACEMENT_KEYS = ['kind', 'x', 'z', 'rotation'] as const;

const RESULTS: Readonly<Record<PlacementResult04['reason'], PlacementResult04>> = Object.freeze({
  valid: Object.freeze({ valid: true, reason: 'valid' }),
  invalid: Object.freeze({ valid: false, reason: 'invalid' }),
  'off-grid': Object.freeze({ valid: false, reason: 'off-grid' }),
  rotation: Object.freeze({ valid: false, reason: 'rotation' }),
  outside: Object.freeze({ valid: false, reason: 'outside' }),
  reserved: Object.freeze({ valid: false, reason: 'reserved' }),
  occupied: Object.freeze({ valid: false, reason: 'occupied' }),
  'duplicate-kind': Object.freeze({ valid: false, reason: 'duplicate-kind' }),
  'invalid-state': Object.freeze({ valid: false, reason: 'invalid-state' }),
});

type ValidatedPlacement = Readonly<{
  placement: Placement04;
  halfX: bigint;
  halfZ: bigint;
}>;

type SingleValidation =
  | Readonly<{ valid: true; value: ValidatedPlacement }>
  | Readonly<{
    valid: false;
    reason: 'invalid' | 'off-grid' | 'rotation' | 'outside' | 'reserved';
  }>;

function enumerableOwnKeys(value: object): readonly PropertyKey[] {
  return Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));
}

function hasExactPlacementFields(value: object): boolean {
  const keys = enumerableOwnKeys(value);
  return keys.length === PLACEMENT_KEYS.length
    && keys.every((key) => typeof key === 'string' && PLACEMENT_KEYS.includes(
      key as (typeof PLACEMENT_KEYS)[number],
    ));
}

function footprintFor(kind: unknown): (typeof FOOTPRINTS)[number] | undefined {
  return FOOTPRINTS.find(([candidateKind]) => candidateKind === kind);
}

function overlap(
  ax: bigint,
  az: bigint,
  ahx: bigint,
  ahz: bigint,
  bx: bigint,
  bz: bigint,
  bhx: bigint,
  bhz: bigint,
): boolean {
  return (ax > bx ? ax - bx : bx - ax) < ahx + bhx
    && (az > bz ? az - bz : bz - az) < ahz + bhz;
}

function validateSinglePlacement(value: unknown): SingleValidation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, reason: 'invalid' };
  }
  if (!hasExactPlacementFields(value)) {
    return { valid: false, reason: 'invalid' };
  }

  const candidate = value as Readonly<Record<(typeof PLACEMENT_KEYS)[number], unknown>>;
  const footprint = footprintFor(candidate.kind);
  if (
    footprint === undefined
    || typeof candidate.x !== 'bigint'
    || typeof candidate.z !== 'bigint'
    || candidate.x < I64_MIN
    || candidate.x > I64_MAX
    || candidate.z < I64_MIN
    || candidate.z > I64_MAX
  ) {
    return { valid: false, reason: 'invalid' };
  }
  if (
    typeof candidate.rotation !== 'number'
    || !ROTATIONS.includes(candidate.rotation as (typeof ROTATIONS)[number])
  ) {
    return { valid: false, reason: 'rotation' };
  }
  if (candidate.x % SNAP !== 0n || candidate.z % SNAP !== 0n) {
    return { valid: false, reason: 'off-grid' };
  }

  const [, unrotatedHalfX, unrotatedHalfZ] = footprint;
  const swapExtents = candidate.rotation === 90_000 || candidate.rotation === 270_000;
  const halfX = swapExtents ? unrotatedHalfZ : unrotatedHalfX;
  const halfZ = swapExtents ? unrotatedHalfX : unrotatedHalfZ;
  if (
    candidate.x - halfX < SUPPORT[0]
    || candidate.x + halfX > SUPPORT[1]
    || candidate.z - halfZ < SUPPORT[2]
    || candidate.z + halfZ > SUPPORT[3]
  ) {
    return { valid: false, reason: 'outside' };
  }

  for (const [, x, z, exclusionHalfX, exclusionHalfZ] of EXCLUSIONS) {
    if (overlap(
      candidate.x,
      candidate.z,
      halfX,
      halfZ,
      x,
      z,
      exclusionHalfX,
      exclusionHalfZ,
    )) {
      return { valid: false, reason: 'reserved' };
    }
  }

  return {
    valid: true,
    value: {
      placement: candidate as Placement04,
      halfX,
      halfZ,
    },
  };
}

function validateOccupiedGraph(value: unknown): readonly ValidatedPlacement[] | undefined {
  if (!Array.isArray(value) || value.length > FOOTPRINTS.length) {
    return undefined;
  }

  const keys = enumerableOwnKeys(value);
  if (
    keys.length !== value.length
    || keys.some((key, index) => key !== String(index))
  ) {
    return undefined;
  }

  const validated: ValidatedPlacement[] = [];
  const kinds = new Set<Building04>();
  for (const placement of value) {
    const result = validateSinglePlacement(placement);
    if (!result.valid || kinds.has(result.value.placement.kind)) {
      return undefined;
    }
    kinds.add(result.value.placement.kind);
    validated.push(result.value);
  }

  for (let firstIndex = 0; firstIndex < validated.length; firstIndex += 1) {
    const first = validated[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < validated.length; secondIndex += 1) {
      const second = validated[secondIndex];
      if (overlap(
        first.placement.x,
        first.placement.z,
        first.halfX,
        first.halfZ,
        second.placement.x,
        second.placement.z,
        second.halfX,
        second.halfZ,
      )) {
        return undefined;
      }
    }
  }

  return validated;
}

export function evaluatePlacement04(
  candidate: Placement04,
  occupied: readonly Placement04[],
): PlacementResult04 {
  const validatedOccupied = validateOccupiedGraph(occupied);
  if (validatedOccupied === undefined) {
    return RESULTS['invalid-state'];
  }

  const validatedCandidate = validateSinglePlacement(candidate);
  if (!validatedCandidate.valid) {
    return RESULTS[validatedCandidate.reason];
  }

  if (validatedOccupied.some((existing) => (
    existing.placement.kind === validatedCandidate.value.placement.kind
  ))) {
    return RESULTS['duplicate-kind'];
  }

  for (const existing of validatedOccupied) {
    if (overlap(
      validatedCandidate.value.placement.x,
      validatedCandidate.value.placement.z,
      validatedCandidate.value.halfX,
      validatedCandidate.value.halfZ,
      existing.placement.x,
      existing.placement.z,
      existing.halfX,
      existing.halfZ,
    )) {
      return RESULTS.occupied;
    }
  }

  return RESULTS.valid;
}

export function placementDigestInput04(): string {
  return `${JSON.stringify([
    GAMEPLAY04_LAYOUT_VERSION,
    PRESENTATION_DIGEST,
    SNAP.toString(),
    ROTATIONS,
    SUPPORT.map((value) => value.toString()),
    FOOTPRINTS.map(([kind, halfX, halfZ]) => [kind, halfX.toString(), halfZ.toString()]),
    EXCLUSIONS.map(([id, x, z, halfX, halfZ]) => [
      id,
      x.toString(),
      z.toString(),
      halfX.toString(),
      halfZ.toString(),
    ]),
  ])}\n`;
}
