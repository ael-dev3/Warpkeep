import { evaluatePlacement04, type Placement04 } from '../../../spacetimedb/gameplay04/placement';
import {
  buildingCost04, buildingDuration04, gatheringYield04, travelPerEdge04,
  type Building04, type CompletedLevels04, type Cost04, type Resource04,
} from '../../../spacetimedb/gameplay04/policy';
import type { State04 } from './gameplay04State';
import type { Atlas04, BuildQuote04 } from './ptrGameplay04Types';

export type View04 = Readonly<{
  state: State04; atlas: Atlas04 | null; receivedAtMs: number;
  balances: Cost04; pending: Cost04; buildings: readonly BuildingView04[]; workers: readonly WorkerView04[];
}>;
export type BuildingView04 = Readonly<{
  kind: Building04; placement: Placement04; completedLevel: number;
  targetLevel: number; phase: 'constructing' | 'complete';
  startsAtMicros: bigint | null; completesAtMicros: bigint | null;
}>;
export type WorkerView04 = Readonly<{
  ordinal: number; assignmentRevision: bigint; phase: 'idle' | 'outbound' | 'gathering' | 'returning';
  resource: Resource04 | null; route: readonly Readonly<{ q: number; r: number }>[];
  returnsAtMicros: bigint | null; capturedYield: bigint | null; pendingYield: bigint | null;
  lastReturnResource: Resource04 | null; lastCredited: bigint | null; lastOverflow: bigint | null;
}>;

export const PENDING_LABEL04 = 'pending · not spendable';
const RESOURCES = ['food', 'wood', 'stone', 'gold'] as const;
const ECONOMY = {
  'city-mill': ['food', 'Food'], 'lumber-camp': ['wood', 'Wood'],
  'city-stoneworks': ['stone', 'Stone'], 'city-goldworks': ['gold', 'Gold'],
} as const;

function completedLevels(state: State04): CompletedLevels04 {
  const c = state.completedLevels;
  return { 'city-mill': c.mill, 'lumber-camp': c.lumberCamp, 'city-stoneworks': c.stoneworks,
    'city-goldworks': c.goldworks, 'city-barracks': c.barracks, 'grand-covenant-cathedral': c.cathedral };
}

export function presentState04(state: State04, atlas: Atlas04 | null, receivedAtMs: number): View04 {
  const pending = { food: 0n, wood: 0n, stone: 0n, gold: 0n };
  const workers = state.workers.map((worker): WorkerView04 => {
    const assignment = worker.assignment;
    if (assignment !== undefined) pending[assignment.resource as Resource04] += assignment.earned;
    return Object.freeze({
      ordinal: worker.ordinal, assignmentRevision: worker.assignmentRevision,
      phase: (assignment?.phase ?? 'idle') as WorkerView04['phase'], resource: (assignment?.resource ?? null) as Resource04 | null,
      route: Object.freeze((assignment?.route ?? []).map(point => Object.freeze({ q: point.q, r: point.r }))),
      returnsAtMicros: assignment?.returnsAt ?? null, capturedYield: assignment?.yieldPerQuantum ?? null,
      pendingYield: assignment?.earned ?? null,
      lastReturnResource: (worker.lastReturn?.resource ?? null) as Resource04 | null,
      lastCredited: worker.lastReturn?.credited ?? null, lastOverflow: worker.lastReturn?.overflow ?? null,
    });
  });
  const buildings = state.buildings.map((building): BuildingView04 => {
    const project = state.project?.kind === building.kind ? state.project : undefined;
    return Object.freeze({
      kind: building.kind as Building04,
      placement: Object.freeze({ kind: building.kind as Building04, x: building.x, z: building.z, rotation: building.rotation }),
      completedLevel: building.completedLevel, targetLevel: project?.targetLevel ?? building.completedLevel,
      phase: project === undefined ? 'complete' : 'constructing',
      startsAtMicros: project?.startedAtMicros ?? null, completesAtMicros: project?.completesAtMicros ?? null,
    });
  });
  return Object.freeze({ state, atlas: atlas === null ? null : Object.freeze({ atlasId: atlas.atlasId, revision: atlas.revision }), receivedAtMs,
    balances: Object.freeze({ food: state.food, wood: state.wood, stone: state.stone, gold: state.gold }),
    pending: Object.freeze(pending), buildings: Object.freeze(buildings), workers: Object.freeze(workers) });
}

function placementCopy(value: Placement04): Placement04 {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const fields = ['kind', 'x', 'z', 'rotation'];
    const copy: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new Error();
      if (!descriptor.enumerable) continue;
      if (typeof key !== 'string' || !fields.includes(key)) throw new Error();
      copy[key] = descriptor.value;
    }
    if (fields.some(key => !Object.hasOwn(copy, key))) throw new Error();
    const result = evaluatePlacement04(copy as Placement04, []);
    if (result.reason === 'invalid' || result.reason === 'off-grid' || result.reason === 'rotation') throw new Error();
    return Object.freeze(copy as Placement04);
  } catch { throw new Error('Placement is invalid.'); }
}

export function quoteBuilding04(view: View04, kind: Building04, placement: Placement04): BuildQuote04 {
  if (view.atlas === null) throw new Error('Atlas is unavailable.');
  if (view.state.project !== undefined) throw new Error('Builder is busy.');
  const completed = completedLevels(view.state);
  if (completed[kind] === 5) throw new Error('Building is at maximum level.');
  const draft = placementCopy(placement);
  if (draft.kind !== kind) throw new Error('Placement kind does not match.');
  const existing = view.buildings.find(building => building.kind === kind);
  const transform = existing?.placement ?? draft;
  if (!evaluatePlacement04(transform, view.buildings.filter(building => building.kind !== kind).map(building => building.placement)).valid) {
    throw new Error('Placement is invalid.');
  }
  const targetLevel = completed[kind] + 1;
  const cost = buildingCost04(kind, targetLevel);
  const durationMicros = buildingDuration04(targetLevel, completed);
  return Object.freeze({ revision: view.state.revision, atlasRevision: view.atlas.revision,
    policyVersion: view.state.policyVersion, layoutDigest: view.state.layoutDigest,
    kind, targetLevel, placement: Object.freeze({ ...transform }), cost, durationMicros });
}

export function buildingBenefit04(view: View04, kind: Building04): Readonly<{
  label: string; current: bigint; next: bigint; unit: 'per-quantum' | 'micros';
}> {
  const completed = completedLevels(view.state);
  const next = { ...completed, [kind]: Math.min(5, completed[kind] + 1) };
  if (kind === 'city-barracks') return Object.freeze({ label: 'Travel time per edge', current: travelPerEdge04(completed), next: travelPerEdge04(next), unit: 'micros' });
  if (kind === 'grand-covenant-cathedral') return Object.freeze({ label: 'Future level-one build duration', current: buildingDuration04(1, completed), next: buildingDuration04(1, next), unit: 'micros' });
  const [resource, label] = ECONOMY[kind];
  return Object.freeze({ label: `${label} every 10 seconds`, current: gatheringYield04(resource, completed), next: gatheringYield04(resource, next), unit: 'per-quantum' });
}

export function buildingDeficits04(view: View04, kind: Building04): Cost04 {
  const level = completedLevels(view.state)[kind];
  const deficits = { food: 0n, wood: 0n, stone: 0n, gold: 0n };
  if (level < 5) {
    const cost = buildingCost04(kind, level + 1);
    for (const resource of RESOURCES) deficits[resource] = cost[resource] > view.balances[resource] ? cost[resource] - view.balances[resource] : 0n;
  }
  return Object.freeze(deficits);
}
