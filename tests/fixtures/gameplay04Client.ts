import { GAMEPLAY04_POLICY_VERSION, buildingDuration04, gatheringYield04, travelPerEdge04, type Building04, type CompletedLevels04 } from '../../spacetimedb/gameplay04/policy';
import { GAMEPLAY04_LAYOUT_VERSION } from '../../spacetimedb/gameplay04/placement';
import { GAMEPLAY04_LAYOUT_DIGEST } from '../../spacetimedb/gameplay04/construction';
import type { ReadWire04 } from '../../src/ptr/gameplay04/ptrGameplay04Types';
import type { PtrGameplay04Capability } from '../../src/ptr/ptrRealmConnection';
import { vi } from 'vitest';

export const EMPTY_WIRE04 = {
  policyVersion: GAMEPLAY04_POLICY_VERSION,
  layoutVersion: GAMEPLAY04_LAYOUT_VERSION, layoutDigest: GAMEPLAY04_LAYOUT_DIGEST,
  revision: 1n, lastAcceptedSequence: 1n,
  food: 0n, wood: 0n, stone: 0n, gold: 0n,
  workers: [0, 1, 2, 3].map(ordinal => ({ ordinal, assignmentRevision: 0n,
    assignment: undefined, lastReturn: undefined })),
  buildings: [], project: undefined,
  completedLevels: { mill: 0, lumberCamp: 0, stoneworks: 0, goldworks: 0, barracks: 0, cathedral: 0 },
  completedEffects: { foodYieldPerQuantum: 10n, woodYieldPerQuantum: 10n,
    stoneYieldPerQuantum: 10n, goldYieldPerQuantum: 10n,
    travelPerEdgeMicros: 2_000_000n, levelOneBuildDurationMicros: 120_000_000n },
} satisfies ReadWire04;

export const SCOPE04 = { generation: 1, databaseIdentity: 'a'.repeat(64), anchorQ: 0, anchorR: 0 };
export const ATLAS04 = { atlasId: 'test-atlas', revision: 3n };
export const MILL_PLACEMENT04 = { kind: 'city-mill', x: -24_000_000n, z: -20_000_000n, rotation: 0 } as const;

type Mutable04<T> = { -readonly [K in keyof T]: Mutable04<T[K]> };

export function freshWire04(): Mutable04<ReadWire04> { return structuredClone(EMPTY_WIRE04); }

export function assignmentWire04(): NonNullable<ReadWire04['workers'][number]['assignment']> {
  return {
    locationId: 'food-site', destinationCellKey: 'CELL:1:0', resource: 'food',
    route: [{ q: 0, r: 0 }, { q: 1, r: 0 }], dispatchedAt: 0n, routeEdges: 1,
    travelPerEdgeMicros: 2_000_000n, gatheringDurationMicros: 60_000_000n,
    yieldPerQuantum: 10n, recalledAt: undefined, phase: 'outbound',
    arrivesAt: 2_000_000n, gatheringStopsAt: 62_000_000n, returnsAt: 64_000_000n, earned: 0n,
  };
}

export function wireWithBuilding04(kind: Building04 = 'city-mill', level = 1): Mutable04<ReadWire04> {
  const wire = freshWire04();
  const keys = {
    'city-mill': 'mill', 'lumber-camp': 'lumberCamp', 'city-stoneworks': 'stoneworks',
    'city-goldworks': 'goldworks', 'city-barracks': 'barracks', 'grand-covenant-cathedral': 'cathedral',
  } as const;
  const completed: CompletedLevels04 = {
    'city-mill': 0, 'lumber-camp': 0, 'city-stoneworks': 0,
    'city-goldworks': 0, 'city-barracks': 0, 'grand-covenant-cathedral': 0,
    [kind]: level,
  };
  if (level > 0) wire.buildings.push({ ...MILL_PLACEMENT04, kind, completedLevel: level, revision: BigInt(level) });
  wire.completedLevels[keys[kind]] = level;
  wire.completedEffects = {
    foodYieldPerQuantum: gatheringYield04('food', completed),
    woodYieldPerQuantum: gatheringYield04('wood', completed),
    stoneYieldPerQuantum: gatheringYield04('stone', completed),
    goldYieldPerQuantum: gatheringYield04('gold', completed),
    travelPerEdgeMicros: travelPerEdge04(completed),
    levelOneBuildDurationMicros: buildingDuration04(1, completed),
  };
  return wire;
}

export function constructingWire04(): Mutable04<ReadWire04> {
  const wire = freshWire04();
  wire.buildings.push({ ...MILL_PLACEMENT04, completedLevel: 0, revision: 1n });
  wire.project = {
    kind: 'city-mill', projectRevision: 1n, targetLevel: 1,
    startedAtMicros: 5n, completesAtMicros: 120_000_005n,
    cost: { food: 20n, wood: 40n, stone: 20n, gold: 0n }, durationMicros: 120_000_000n,
  };
  return wire;
}

export function expectDeepFrozen04(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(expectDeepFrozen04);
}

// Controller unit-test transport only; never passes production capability branding.
export function scriptedCapability04() {
  let current = true;
  const read = vi.fn<PtrGameplay04Capability['read']>().mockImplementation(async () => freshWire04());
  const mutate = vi.fn<PtrGameplay04Capability['mutate']>().mockResolvedValue({ sequence: 2n, revision: 2n });
  const capability: PtrGameplay04Capability = Object.freeze({
    scope: Object.freeze({ ...SCOPE04 }), isCurrent: () => current, read, mutate,
  });
  return { capability, read, mutate, expire: () => { current = false; } };
}
