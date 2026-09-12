import { GAMEPLAY04_LAYOUT_DIGEST } from '../../../spacetimedb/gameplay04/construction';
import { GAMEPLAY04_LAYOUT_VERSION, evaluatePlacement04, type Placement04 } from '../../../spacetimedb/gameplay04/placement';
import {
  GAMEPLAY04_BALANCE_CAP, GAMEPLAY04_GATHER_QUANTUM_MICROS, GAMEPLAY04_POLICY_VERSION,
  buildingCost04, buildingDuration04, gatheringYield04, travelPerEdge04,
  type Building04, type CompletedLevels04, type Resource04,
} from '../../../spacetimedb/gameplay04/policy';
import { observeJourney04, type Journey04 } from '../../../spacetimedb/gameplay04/workerJourney';
import { validateReturnOutcome04, validateRoute04 } from '../../../spacetimedb/gameplay04/workerState';
import { Gameplay04ClientError } from './ptrGameplay04Errors';
import type { ReadWire04, Scope04 } from './ptrGameplay04Types';

export type State04 = Readonly<ReadWire04>;
type WorkerWire04 = ReadWire04['workers'][number];
type AssignmentWire04 = NonNullable<WorkerWire04['assignment']>;
type BuildingWire04 = ReadWire04['buildings'][number];
type ProjectWire04 = NonNullable<ReadWire04['project']>;

const RESOURCES = ['food', 'wood', 'stone', 'gold'] as const;
const LEVEL_KEYS = {
  'city-mill': 'mill', 'lumber-camp': 'lumberCamp', 'city-stoneworks': 'stoneworks',
  'city-goldworks': 'goldworks', 'city-barracks': 'barracks', 'grand-covenant-cathedral': 'cathedral',
} as const;
const BUILDINGS = Object.keys(LEVEL_KEYS) as Building04[];
const U64_MAX = (1n << 64n) - 1n;
const I64_MAX = (1n << 63n) - 1n;

function invalid(): never { throw new Gameplay04ClientError('invalid-state'); }

// Never read wire properties through [[Get]]. Copy only own enumerable data
// descriptors into fresh, closed records before calling shared policy helpers.
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) invalid();
    if (!descriptor.enumerable) continue;
    if (typeof key !== 'string' || !fields.includes(key)) invalid();
    copy[key] = descriptor.value;
  }
  if (fields.some(key => !Object.hasOwn(copy, key))) invalid();
  return copy;
}

function array(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value)) invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (typeof length !== 'number' || !Number.isInteger(length) || length < min || length > max) invalid();
  const copy = new Array<unknown>(length);
  let count = 0;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) invalid();
    if (key === 'length') continue;
    if (!descriptor.enumerable) continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)) invalid();
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= length) invalid();
    copy[index] = descriptor.value; count += 1;
  }
  if (count !== length) invalid();
  return copy;
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
function bigint(value: unknown, max = U64_MAX, min = 0n): bigint {
  if (typeof value !== 'bigint' || value < min || value > max) invalid();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) invalid();
  return value;
}
function resource(value: unknown): Resource04 {
  if (typeof value !== 'string' || !RESOURCES.includes(value as Resource04)) invalid();
  return value as Resource04;
}
function kind(value: unknown): Building04 {
  if (typeof value !== 'string' || !BUILDINGS.includes(value as Building04)) invalid();
  return value as Building04;
}
function cost(value: unknown): ProjectWire04['cost'] {
  const copy = record(value, RESOURCES);
  return { food: bigint(copy.food), wood: bigint(copy.wood), stone: bigint(copy.stone), gold: bigint(copy.gold) };
}
function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

function assignment(value: unknown, scope: Scope04): AssignmentWire04 {
  const a = record(value, [
    'locationId', 'destinationCellKey', 'resource', 'route', 'dispatchedAt', 'routeEdges',
    'travelPerEdgeMicros', 'gatheringDurationMicros', 'yieldPerQuantum', 'recalledAt',
    'phase', 'arrivesAt', 'gatheringStopsAt', 'returnsAt', 'earned',
  ]);
  const route = array(a.route, 1, 8193).map(value => {
    const point = record(value, ['q', 'r']);
    return { q: integer(point.q, -0x8000_0000, 0x7fff_ffff), r: integer(point.r, -0x8000_0000, 0x7fff_ffff) };
  });
  validateRoute04(route);
  if (route[0].q !== scope.anchorQ || route[0].r !== scope.anchorR) invalid();
  const copy: AssignmentWire04 = {
    locationId: text(a.locationId), destinationCellKey: text(a.destinationCellKey), resource: resource(a.resource), route,
    dispatchedAt: bigint(a.dispatchedAt, I64_MAX), routeEdges: integer(a.routeEdges, 0, 8192),
    travelPerEdgeMicros: bigint(a.travelPerEdgeMicros, I64_MAX), gatheringDurationMicros: bigint(a.gatheringDurationMicros, I64_MAX),
    yieldPerQuantum: bigint(a.yieldPerQuantum), recalledAt: a.recalledAt === undefined ? undefined : bigint(a.recalledAt, I64_MAX),
    phase: text(a.phase), arrivesAt: bigint(a.arrivesAt, I64_MAX), gatheringStopsAt: bigint(a.gatheringStopsAt, I64_MAX),
    returnsAt: bigint(a.returnsAt, I64_MAX), earned: bigint(a.earned),
  };
  if (copy.routeEdges !== route.length - 1) invalid();
  const journey: Journey04 = {
    resource: resource(copy.resource), dispatchedAt: copy.dispatchedAt, routeEdges: copy.routeEdges,
    travelPerEdgeMicros: copy.travelPerEdgeMicros, gatheringDurationMicros: copy.gatheringDurationMicros,
    yieldPerQuantum: copy.yieldPerQuantum, recalledAt: copy.recalledAt ?? null,
  };
  // Validate captured rates/times, then choose a witness instant for the reported
  // phase/accrual. No observedAt exists on the wire: this proves possibility, not
  // freshness, and never replaces the authoritative reported phase or earnings.
  const derived = observeJourney04(journey, journey.recalledAt ?? journey.dispatchedAt);
  if (copy.arrivesAt !== derived.arrivesAt || copy.gatheringStopsAt !== derived.gatheringStopsAt || copy.returnsAt !== derived.returnsAt) invalid();
  if (copy.earned % copy.yieldPerQuantum !== 0n) invalid();
  let witness: bigint;
  if (copy.phase === 'outbound') witness = copy.dispatchedAt;
  else if (copy.phase === 'gathering') witness = copy.arrivesAt + copy.earned / copy.yieldPerQuantum * GAMEPLAY04_GATHER_QUANTUM_MICROS;
  else if (copy.phase === 'returning') witness = copy.gatheringStopsAt;
  else invalid();
  const observed = observeJourney04(journey, witness);
  if (observed.phase !== copy.phase || observed.earned !== copy.earned) invalid();
  return copy;
}

function worker(value: unknown, scope: Scope04): WorkerWire04 {
  const w = record(value, ['ordinal', 'assignmentRevision', 'assignment', 'lastReturn']);
  const lastReturn = w.lastReturn === undefined ? undefined : {
    ...validateReturnOutcome04(record(w.lastReturn, ['assignmentRevision', 'resource', 'returnedAtMicros', 'earned', 'credited', 'overflow'])),
  };
  const copy: WorkerWire04 = {
    ordinal: integer(w.ordinal, 0, 3), assignmentRevision: bigint(w.assignmentRevision),
    assignment: w.assignment === undefined ? undefined : assignment(w.assignment, scope),
    lastReturn,
  };
  if (lastReturn !== undefined) {
    if (lastReturn.credited > GAMEPLAY04_BALANCE_CAP
      || lastReturn.assignmentRevision > copy.assignmentRevision
      || (copy.assignment !== undefined && lastReturn.assignmentRevision === copy.assignmentRevision)) invalid();
  }
  if (copy.assignment !== undefined && copy.assignmentRevision === 0n) invalid();
  return copy;
}

function building(value: unknown): BuildingWire04 {
  const b = record(value, ['kind', 'x', 'z', 'rotation', 'completedLevel', 'revision']);
  return {
    kind: kind(b.kind), x: bigint(b.x, I64_MAX, -I64_MAX - 1n), z: bigint(b.z, I64_MAX, -I64_MAX - 1n),
    rotation: integer(b.rotation, 0, 270_000), completedLevel: integer(b.completedLevel, 0, 5), revision: bigint(b.revision, U64_MAX, 1n),
  };
}

function project(value: unknown): ProjectWire04 {
  const p = record(value, ['kind', 'projectRevision', 'targetLevel', 'startedAtMicros', 'completesAtMicros', 'cost', 'durationMicros']);
  return {
    kind: kind(p.kind), projectRevision: bigint(p.projectRevision, U64_MAX, 1n), targetLevel: integer(p.targetLevel, 1, 5),
    startedAtMicros: bigint(p.startedAtMicros, I64_MAX), completesAtMicros: bigint(p.completesAtMicros, I64_MAX),
    cost: cost(p.cost), durationMicros: bigint(p.durationMicros, I64_MAX, 1n),
  };
}

export function decodeState04(value: unknown, scope: Scope04): State04 {
  try {
    integer(scope.anchorQ, -0x8000_0000, 0x7fff_ffff);
    integer(scope.anchorR, -0x8000_0000, 0x7fff_ffff);
    const wire = record(value, [
      'policyVersion', 'layoutVersion', 'layoutDigest', 'revision', 'lastAcceptedSequence',
      ...RESOURCES, 'workers', 'buildings', 'project', 'completedLevels', 'completedEffects',
    ]);
    if (wire.policyVersion !== GAMEPLAY04_POLICY_VERSION || wire.layoutVersion !== GAMEPLAY04_LAYOUT_VERSION || wire.layoutDigest !== GAMEPLAY04_LAYOUT_DIGEST) invalid();
    const workers = array(wire.workers, 4, 4).map(value => worker(value, scope));
    if (new Set(workers.map(w => w.ordinal)).size !== 4) invalid();
    const buildings = array(wire.buildings, 0, 6).map(building);
    const activeProject = wire.project === undefined ? undefined : project(wire.project);
    const placements: Placement04[] = [];
    const completed: Record<Building04, number> = {
      'city-mill': 0, 'lumber-camp': 0, 'city-stoneworks': 0, 'city-goldworks': 0, 'city-barracks': 0, 'grand-covenant-cathedral': 0,
    };
    for (const b of buildings) {
      const placement = { kind: kind(b.kind), x: b.x, z: b.z, rotation: b.rotation };
      if (!evaluatePlacement04(placement, placements).valid) invalid();
      placements.push(placement);
      completed[placement.kind] = b.completedLevel;
      const constructing = activeProject?.kind === b.kind;
      if ((!constructing && b.completedLevel === 0) || b.revision !== BigInt(b.completedLevel + (constructing ? 1 : 0))) invalid();
    }
    if (activeProject !== undefined) {
      const b = buildings.find(b => b.kind === activeProject.kind);
      if (b === undefined || activeProject.targetLevel !== b.completedLevel + 1
        || activeProject.projectRevision !== b.revision || activeProject.projectRevision !== BigInt(activeProject.targetLevel)
        || activeProject.completesAtMicros - activeProject.startedAtMicros !== activeProject.durationMicros
        || activeProject.durationMicros !== buildingDuration04(activeProject.targetLevel, completed)) invalid();
      const expectedCost = buildingCost04(kind(activeProject.kind), activeProject.targetLevel);
      if (RESOURCES.some(resource => activeProject.cost[resource] !== expectedCost[resource])) invalid();
    }
    const levels = record(wire.completedLevels, Object.values(LEVEL_KEYS));
    for (const buildingKind of BUILDINGS) if (levels[LEVEL_KEYS[buildingKind]] !== completed[buildingKind]) invalid();
    const expectedEffects = effects(completed);
    const returnedEffects = record(wire.completedEffects, Object.keys(expectedEffects));
    for (const key of Object.keys(expectedEffects) as (keyof typeof expectedEffects)[]) if (returnedEffects[key] !== expectedEffects[key]) invalid();
    return freezeTree({
      policyVersion: wire.policyVersion, layoutVersion: wire.layoutVersion, layoutDigest: wire.layoutDigest,
      revision: bigint(wire.revision, U64_MAX, 1n), lastAcceptedSequence: bigint(wire.lastAcceptedSequence, U64_MAX, 1n),
      food: bigint(wire.food, GAMEPLAY04_BALANCE_CAP), wood: bigint(wire.wood, GAMEPLAY04_BALANCE_CAP),
      stone: bigint(wire.stone, GAMEPLAY04_BALANCE_CAP), gold: bigint(wire.gold, GAMEPLAY04_BALANCE_CAP),
      workers, buildings, project: activeProject,
      completedLevels: { mill: completed['city-mill'], lumberCamp: completed['lumber-camp'], stoneworks: completed['city-stoneworks'],
        goldworks: completed['city-goldworks'], barracks: completed['city-barracks'], cathedral: completed['grand-covenant-cathedral'] },
      completedEffects: expectedEffects,
    });
  } catch { return invalid(); }
}

function effects(completed: CompletedLevels04): ReadWire04['completedEffects'] {
  return {
    foodYieldPerQuantum: gatheringYield04('food', completed), woodYieldPerQuantum: gatheringYield04('wood', completed),
    stoneYieldPerQuantum: gatheringYield04('stone', completed), goldYieldPerQuantum: gatheringYield04('gold', completed),
    travelPerEdgeMicros: travelPerEdge04(completed), levelOneBuildDurationMicros: buildingDuration04(1, completed),
  };
}
