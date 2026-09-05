import {
  Gameplay04KeepError,
  boundedRows04,
  canonicalFingerprint04,
  commitGameplay04Command,
  failGameplay04,
  isPositiveU64Gameplay04,
  isTimestampGameplay04,
  isU64Gameplay04,
  preflightSequence04,
  requireExactFieldsGameplay04,
  validateBinding04,
  validateKeepRow04,
  validateRequestKey04,
  validateTimestamp04,
} from './commands';
import { readKeep04, type KeepBinding04, type KeepRow04 } from './keep';
import {
  GAMEPLAY04_LAYOUT_VERSION,
  evaluatePlacement04,
  type Placement04,
} from './placement';
import {
  GAMEPLAY04_POLICY_VERSION,
  Gameplay04PolicyError,
  buildingCost04,
  buildingDuration04,
  type Building04,
  type CompletedLevels04,
  type Cost04,
} from './policy';
import {
  Gameplay04WorkerError,
  reconcileWorkersWithoutRevision04,
  type WorkerStorage04,
} from './workers';

export const GAMEPLAY04_LAYOUT_DIGEST =
  '152d900c9e2309ed822610d3b885e9dcbd0dcae1d5621b3ddbaf788844f6dec8';

const BUILDINGS = Object.freeze([
  'city-mill',
  'lumber-camp',
  'city-stoneworks',
  'city-goldworks',
  'city-barracks',
  'grand-covenant-cathedral',
] as const);
const INPUT_FIELDS = Object.freeze([
  'sequence', 'requestKey', 'expectedRevision', 'expectedAtlasRevision',
  'policyVersion', 'layoutDigest', 'kind', 'targetLevel', 'x', 'z',
  'rotation', 'expectedCost', 'expectedDurationMicros',
] as const);
const COST_FIELDS = Object.freeze(['food', 'wood', 'stone', 'gold'] as const);

export type BuildingRow04 = Readonly<{
  buildingId: string;
  keepId: string;
  kind: Building04;
  x: bigint;
  z: bigint;
  rotation: number;
  completedLevel: number;
  revision: bigint;
}>;

export type ProjectRow04 = Readonly<{
  keepId: string;
  projectRevision: bigint;
  buildingId: string;
  targetLevel: number;
  startedAtMicros: bigint;
  completesAtMicros: bigint;
  cost: Cost04;
  durationMicros: bigint;
  policyVersion: string;
  layoutDigest: string;
}>;

export type ProjectSchedule04 = Readonly<{
  scheduleId: bigint;
  keepId: string;
  buildingId: string;
  projectRevision: bigint;
  dueAtMicros: bigint;
}>;

export type StartBuildingInput04 = Readonly<{
  sequence: bigint;
  requestKey: string;
  expectedRevision: bigint;
  expectedAtlasRevision: bigint;
  policyVersion: string;
  layoutDigest: string;
  kind: Building04;
  targetLevel: number;
  x: bigint;
  z: bigint;
  rotation: number;
  expectedCost: Cost04;
  expectedDurationMicros: bigint;
}>;

export type CommandResult04 = Readonly<{ sequence: bigint; revision: bigint }>;

export interface ConstructionStorage04 extends WorkerStorage04 {
  buildings(keepId: string): Iterable<BuildingRow04>;
  findProject(keepId: string): ProjectRow04 | null;
  insertBuilding(row: BuildingRow04): void;
  updateBuilding(row: BuildingRow04): void;
  insertProject(row: ProjectRow04): void;
  deleteProject(keepId: string): void;
  projectSchedules(keepId: string): Iterable<ProjectSchedule04>;
  insertProjectSchedule(row: Omit<ProjectSchedule04, 'scheduleId'>): void;
  deleteProjectSchedule(scheduleId: bigint): void;
}

export type Gameplay04ConstructionErrorCode =
  | 'GAMEPLAY04_INPUT_INVALID'
  | 'GAMEPLAY04_STORED_STATE_INVALID'
  | 'GAMEPLAY04_BUILDER_BUSY'
  | 'GAMEPLAY04_INSUFFICIENT_RESOURCES'
  | 'GAMEPLAY04_REVISION_OVERFLOW'
  | 'GAMEPLAY04_RECEIPT_CONFLICT'
  | 'GAMEPLAY04_RECEIPT_EXPIRED'
  | 'GAMEPLAY04_SEQUENCE_INVALID';

export class Gameplay04ConstructionError extends Error {
  constructor(readonly code: Gameplay04ConstructionErrorCode) {
    super(code);
    this.name = 'Gameplay04ConstructionError';
  }
}

function constructionFail(code: Gameplay04ConstructionErrorCode): never {
  throw new Gameplay04ConstructionError(code);
}

function mapError<T>(effect: () => T): T {
  try {
    return effect();
  } catch (error) {
    if (error instanceof Gameplay04ConstructionError) throw error;
    if (error instanceof Gameplay04PolicyError) constructionFail('GAMEPLAY04_INPUT_INVALID');
    if (error instanceof Gameplay04KeepError || error instanceof Gameplay04WorkerError) {
      if (
        error.code === 'GAMEPLAY04_RECEIPT_CONFLICT'
        || error.code === 'GAMEPLAY04_RECEIPT_EXPIRED'
        || error.code === 'GAMEPLAY04_SEQUENCE_INVALID'
        || error.code === 'GAMEPLAY04_REVISION_OVERFLOW'
      ) constructionFail(error.code);
      if (error.code === 'GAMEPLAY04_INPUT_INVALID') constructionFail(error.code);
    }
    throw error;
  }
}

function validateCost(value: unknown, stored: boolean): asserts value is Cost04 {
  try {
    requireExactFieldsGameplay04(value, COST_FIELDS);
  } catch {
    constructionFail(stored ? 'GAMEPLAY04_STORED_STATE_INVALID' : 'GAMEPLAY04_INPUT_INVALID');
  }
  const cost = value as Record<(typeof COST_FIELDS)[number], unknown>;
  if (COST_FIELDS.some(resource => !isU64Gameplay04(cost[resource]))) {
    constructionFail(stored ? 'GAMEPLAY04_STORED_STATE_INVALID' : 'GAMEPLAY04_INPUT_INVALID');
  }
}

function sameCost(left: Cost04, right: Cost04): boolean {
  return COST_FIELDS.every(resource => left[resource] === right[resource]);
}

function fingerprint(input: StartBuildingInput04): string {
  return canonicalFingerprint04([
    'start-building',
    input.sequence.toString(),
    input.requestKey,
    input.expectedRevision.toString(),
    input.expectedAtlasRevision.toString(),
    input.policyVersion,
    input.layoutDigest,
    input.kind,
    input.targetLevel.toString(),
    input.x.toString(),
    input.z.toString(),
    input.rotation.toString(),
    input.expectedCost.food.toString(),
    input.expectedCost.wood.toString(),
    input.expectedCost.stone.toString(),
    input.expectedCost.gold.toString(),
    input.expectedDurationMicros.toString(),
  ]);
}

function validateInput(input: StartBuildingInput04, binding: KeepBinding04): void {
  requireExactFieldsGameplay04(input, INPUT_FIELDS);
  if (!isPositiveU64Gameplay04(input.sequence)) constructionFail('GAMEPLAY04_SEQUENCE_INVALID');
  validateRequestKey04(input.requestKey, input.sequence);
  validateCost(input.expectedCost, false);
  if (
    !isU64Gameplay04(input.expectedRevision)
    || input.expectedAtlasRevision !== binding.atlasRevision
    || input.policyVersion !== GAMEPLAY04_POLICY_VERSION
    || input.layoutDigest !== GAMEPLAY04_LAYOUT_DIGEST
    || !BUILDINGS.includes(input.kind)
    || !Number.isInteger(input.targetLevel)
    || input.targetLevel < 1
    || input.targetLevel > 5
    || typeof input.x !== 'bigint'
    || typeof input.z !== 'bigint'
    || !Number.isInteger(input.rotation)
    || !isTimestampGameplay04(input.expectedDurationMicros)
    || input.expectedDurationMicros === 0n
  ) constructionFail('GAMEPLAY04_INPUT_INVALID');
}

function zeroLevels(): Record<Building04, number> {
  return {
    'city-mill': 0,
    'lumber-camp': 0,
    'city-stoneworks': 0,
    'city-goldworks': 0,
    'city-barracks': 0,
    'grand-covenant-cathedral': 0,
  };
}

type ValidatedConstruction = Readonly<{
  buildings: readonly BuildingRow04[];
  project: ProjectRow04 | null;
  schedules: readonly ProjectSchedule04[];
  completed: CompletedLevels04;
}>;

export function validateConstructionState04(
  storage: ConstructionStorage04,
  binding: KeepBinding04,
): ValidatedConstruction {
  const buildings = boundedRows04(storage.buildings(binding.keepId), BUILDINGS.length);
  const identities = new Set<string>();
  const kinds = new Set<Building04>();
  const placements: Placement04[] = [];
  const completed = zeroLevels();
  for (const row of buildings) {
    const placement = { kind: row.kind, x: row.x, z: row.z, rotation: row.rotation };
    const placementResult = evaluatePlacement04(placement, placements);
    if (
      row.keepId !== binding.keepId
      || !BUILDINGS.includes(row.kind)
      || row.buildingId !== `${binding.keepId}:building:${row.kind}`
      || identities.has(row.buildingId)
      || kinds.has(row.kind)
      || !Number.isInteger(row.completedLevel)
      || row.completedLevel < 0
      || row.completedLevel > 5
      || !isPositiveU64Gameplay04(row.revision)
      || row.revision !== BigInt(Math.max(1, row.completedLevel))
        && row.revision !== BigInt(row.completedLevel + 1)
      || !placementResult.valid
    ) constructionFail('GAMEPLAY04_STORED_STATE_INVALID');
    identities.add(row.buildingId);
    kinds.add(row.kind);
    placements.push(Object.freeze(placement));
    completed[row.kind] = row.completedLevel;
  }
  const project = storage.findProject(binding.keepId);
  const schedules = boundedRows04(storage.projectSchedules(binding.keepId), 1);
  if (project === null) {
    if (
      schedules.length !== 0
      || buildings.some(row => (
        row.completedLevel === 0 || row.revision !== BigInt(row.completedLevel)
      ))
    ) {
      constructionFail('GAMEPLAY04_STORED_STATE_INVALID');
    }
  } else {
    validateCost(project.cost, true);
    const building = buildings.find(row => row.buildingId === project.buildingId);
    if (
      project.keepId !== binding.keepId
      || building === undefined
      || !Number.isInteger(project.targetLevel)
      || project.targetLevel < 1
      || project.targetLevel > 5
      || project.targetLevel !== building.completedLevel + 1
      || project.projectRevision !== building.revision
      || project.projectRevision !== BigInt(project.targetLevel)
      || !isTimestampGameplay04(project.startedAtMicros)
      || !isTimestampGameplay04(project.completesAtMicros)
      || !isTimestampGameplay04(project.durationMicros)
      || project.durationMicros === 0n
      || project.completesAtMicros < project.startedAtMicros
      || project.completesAtMicros - project.startedAtMicros !== project.durationMicros
      || project.policyVersion !== GAMEPLAY04_POLICY_VERSION
      || project.layoutDigest !== GAMEPLAY04_LAYOUT_DIGEST
      || !sameCost(project.cost, buildingCost04(building.kind, project.targetLevel))
      || project.durationMicros !== buildingDuration04(project.targetLevel, completed)
    ) constructionFail('GAMEPLAY04_STORED_STATE_INVALID');
    if (buildings.some(row => row.completedLevel === 0 && row.buildingId !== project.buildingId)) {
      constructionFail('GAMEPLAY04_STORED_STATE_INVALID');
    }
    if (buildings.some(row => (
      row.buildingId !== project.buildingId
      && row.revision !== BigInt(row.completedLevel)
    ))) constructionFail('GAMEPLAY04_STORED_STATE_INVALID');
  }
  const scheduleIds = new Set<bigint>();
  for (const schedule of schedules) {
    if (
      project === null
      || schedule.keepId !== binding.keepId
      || schedule.buildingId !== project.buildingId
      || schedule.projectRevision !== project.projectRevision
      || schedule.dueAtMicros !== project.completesAtMicros
      || !isPositiveU64Gameplay04(schedule.scheduleId)
      || scheduleIds.has(schedule.scheduleId)
      || !isTimestampGameplay04(schedule.dueAtMicros)
    ) constructionFail('GAMEPLAY04_STORED_STATE_INVALID');
    scheduleIds.add(schedule.scheduleId);
  }
  return Object.freeze({
    buildings: Object.freeze(buildings.map(row => Object.freeze({ ...row }))),
    project: project === null ? null : Object.freeze({ ...project, cost: Object.freeze({ ...project.cost }) }),
    schedules: Object.freeze(schedules.map(row => Object.freeze({ ...row }))),
    completed: Object.freeze(completed),
  });
}

export function completedBuildingLevels04(rows: readonly BuildingRow04[]): CompletedLevels04 {
  if (rows.length > BUILDINGS.length) constructionFail('GAMEPLAY04_STORED_STATE_INVALID');
  const completed = zeroLevels();
  const identities = new Set<string>();
  const kinds = new Set<Building04>();
  const placements: Placement04[] = [];
  const keepId = rows[0]?.keepId;
  for (const row of rows) {
    const placement = { kind: row.kind, x: row.x, z: row.z, rotation: row.rotation };
    if (
      keepId === undefined
      || row.keepId !== keepId
      || row.buildingId !== `${keepId}:building:${row.kind}`
      || identities.has(row.buildingId)
      || kinds.has(row.kind)
      || !BUILDINGS.includes(row.kind)
      || !Number.isInteger(row.completedLevel)
      || row.completedLevel < 0
      || row.completedLevel > 5
      || !isPositiveU64Gameplay04(row.revision)
      || row.revision !== BigInt(Math.max(1, row.completedLevel))
        && row.revision !== BigInt(row.completedLevel + 1)
      || !evaluatePlacement04(placement, placements).valid
    ) constructionFail('GAMEPLAY04_STORED_STATE_INVALID');
    identities.add(row.buildingId);
    kinds.add(row.kind);
    placements.push(Object.freeze(placement));
    completed[row.kind] = row.completedLevel;
  }
  return Object.freeze(completed);
}

export type ConstructionReconciliation04 = Readonly<{
  keep: KeepRow04;
  changed: boolean;
}>;

export function reconcileConstructionWithoutRevision04(
  storage: ConstructionStorage04,
  binding: KeepBinding04,
  now: bigint,
  accumulatedKeep?: KeepRow04,
): ConstructionReconciliation04 {
  return mapError(() => {
    validateBinding04(binding);
    validateTimestamp04(now);
    const keep = accumulatedKeep ?? readKeep04(storage, binding).keep;
    validateKeepRow04(keep, binding);
    const state = validateConstructionState04(storage, binding);
    if (state.project === null) return Object.freeze({ keep, changed: false });
    const project = state.project;
    const schedule = state.schedules[0];
    if (project.completesAtMicros <= now) {
      const building = state.buildings.find(row => row.buildingId === project.buildingId)!;
      storage.updateBuilding(Object.freeze({ ...building, completedLevel: project.targetLevel }));
      storage.deleteProject(binding.keepId);
      if (schedule !== undefined) storage.deleteProjectSchedule(schedule.scheduleId);
      return Object.freeze({ keep, changed: true });
    }
    if (schedule === undefined) {
      storage.insertProjectSchedule(Object.freeze({
        keepId: binding.keepId,
        buildingId: project.buildingId,
        projectRevision: project.projectRevision,
        dueAtMicros: project.completesAtMicros,
      }));
      return Object.freeze({ keep, changed: true });
    }
    return Object.freeze({ keep, changed: false });
  });
}

export function startBuilding04(
  storage: ConstructionStorage04,
  binding: KeepBinding04,
  now: bigint,
  input: StartBuildingInput04,
): CommandResult04 {
  return mapError(() => {
    validateBinding04(binding);
    validateTimestamp04(now);
    validateInput(input, binding);
    const keepState = readKeep04(storage, binding);
    const canonical = fingerprint(input);
    const preflight = preflightSequence04(storage, keepState.keep, input, canonical);
    if (preflight.kind === 'replay') {
      return Object.freeze({ sequence: preflight.sequence, revision: preflight.revision });
    }
    const projectReconciled = reconcileConstructionWithoutRevision04(
      storage, binding, now, keepState.keep,
    );
    const workerReconciled = reconcileWorkersWithoutRevision04(
      storage, binding, now, projectReconciled.keep,
    );
    const state = validateConstructionState04(storage, binding);
    if (state.project !== null) constructionFail('GAMEPLAY04_BUILDER_BUSY');
    const existing = state.buildings.find(row => row.kind === input.kind);
    if (existing === undefined) {
      if (input.targetLevel !== 1) constructionFail('GAMEPLAY04_INPUT_INVALID');
      const placement = evaluatePlacement04(
        { kind: input.kind, x: input.x, z: input.z, rotation: input.rotation },
        state.buildings.map(row => ({ kind: row.kind, x: row.x, z: row.z, rotation: row.rotation })),
      );
      if (!placement.valid) constructionFail('GAMEPLAY04_INPUT_INVALID');
    } else if (
      input.targetLevel !== existing.completedLevel + 1
      || input.targetLevel > 5
      || input.x !== existing.x
      || input.z !== existing.z
      || input.rotation !== existing.rotation
    ) constructionFail('GAMEPLAY04_INPUT_INVALID');

    const expectedCost = buildingCost04(input.kind, input.targetLevel);
    const expectedDuration = buildingDuration04(input.targetLevel, state.completed);
    if (
      !sameCost(input.expectedCost, expectedCost)
      || input.expectedDurationMicros !== expectedDuration
      || now > 9_223_372_036_854_775_807n - expectedDuration
    ) constructionFail('GAMEPLAY04_INPUT_INVALID');
    const keep = workerReconciled.keep;
    if (COST_FIELDS.some(resource => keep[resource] < expectedCost[resource])) {
      constructionFail('GAMEPLAY04_INSUFFICIENT_RESOURCES');
    }
    const buildingRevision = existing === undefined ? 1n : existing.revision + 1n;
    if (!isPositiveU64Gameplay04(buildingRevision)) constructionFail('GAMEPLAY04_REVISION_OVERFLOW');
    const building: BuildingRow04 = Object.freeze({
      buildingId: `${binding.keepId}:building:${input.kind}`,
      keepId: binding.keepId,
      kind: input.kind,
      x: input.x,
      z: input.z,
      rotation: input.rotation,
      completedLevel: existing?.completedLevel ?? 0,
      revision: buildingRevision,
    });
    if (existing === undefined) storage.insertBuilding(building);
    else storage.updateBuilding(building);
    const project: ProjectRow04 = Object.freeze({
      keepId: binding.keepId,
      projectRevision: buildingRevision,
      buildingId: building.buildingId,
      targetLevel: input.targetLevel,
      startedAtMicros: now,
      completesAtMicros: now + expectedDuration,
      cost: Object.freeze({ ...expectedCost }),
      durationMicros: expectedDuration,
      policyVersion: GAMEPLAY04_POLICY_VERSION,
      layoutDigest: GAMEPLAY04_LAYOUT_DIGEST,
    });
    storage.insertProject(project);
    storage.insertProjectSchedule(Object.freeze({
      keepId: binding.keepId,
      buildingId: building.buildingId,
      projectRevision: buildingRevision,
      dueAtMicros: project.completesAtMicros,
    }));
    const deducted = Object.freeze({
      ...keep,
      food: keep.food - expectedCost.food,
      wood: keep.wood - expectedCost.wood,
      stone: keep.stone - expectedCost.stone,
      gold: keep.gold - expectedCost.gold,
    });
    return commitGameplay04Command(storage, deducted, input, canonical);
  });
}

export { GAMEPLAY04_LAYOUT_VERSION };
