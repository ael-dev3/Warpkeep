import { SenderError, t } from 'spacetimedb/server';

import genesis002 from './schema';

const gameplay04RoutePointV1 = t.object('Gameplay04RoutePointProjectionV1', {
  q: t.i32(), r: t.i32(),
});

const gameplay04AssignmentStateV1 = t.object('Gameplay04AssignmentStateV1', {
  locationId: t.string(),
  destinationCellKey: t.string(),
  resource: t.string(),
  route: t.array(gameplay04RoutePointV1),
  dispatchedAt: t.i64(),
  routeEdges: t.u32(),
  travelPerEdgeMicros: t.i64(),
  gatheringDurationMicros: t.i64(),
  yieldPerQuantum: t.u64(),
  recalledAt: t.option(t.i64()),
  phase: t.string(),
  arrivesAt: t.i64(),
  gatheringStopsAt: t.i64(),
  returnsAt: t.i64(),
  earned: t.u64(),
});

const gameplay04ReturnOutcomeV1 = t.object('Gameplay04ReturnOutcomeProjectionV1', {
  assignmentRevision: t.u64(),
  resource: t.string(),
  returnedAtMicros: t.i64(),
  earned: t.u64(),
  credited: t.u64(),
  overflow: t.u64(),
});

const gameplay04WorkerStateV1 = t.object('Gameplay04WorkerStateV1', {
  ordinal: t.u32(),
  assignmentRevision: t.u64(),
  assignment: t.option(gameplay04AssignmentStateV1),
  lastReturn: t.option(gameplay04ReturnOutcomeV1),
});

const gameplay04BuildingStateV1 = t.object('Gameplay04BuildingStateV1', {
  kind: t.string(),
  x: t.i64(),
  z: t.i64(),
  rotation: t.u32(),
  completedLevel: t.u32(),
  revision: t.u64(),
});

const gameplay04CostStateV1 = t.object('Gameplay04CostStateV1', {
  food: t.u64(), wood: t.u64(), stone: t.u64(), gold: t.u64(),
});

const gameplay04ProjectStateV1 = t.object('Gameplay04ProjectStateV1', {
  kind: t.string(),
  projectRevision: t.u64(),
  targetLevel: t.u32(),
  startedAtMicros: t.i64(),
  completesAtMicros: t.i64(),
  cost: gameplay04CostStateV1,
  durationMicros: t.i64(),
});

const gameplay04CompletedLevelsV1 = t.object('Gameplay04CompletedLevelsV1', {
  mill: t.u32(),
  lumberCamp: t.u32(),
  stoneworks: t.u32(),
  goldworks: t.u32(),
  barracks: t.u32(),
  cathedral: t.u32(),
});

const gameplay04CompletedEffectsV1 = t.object('Gameplay04CompletedEffectsV1', {
  foodYieldPerQuantum: t.u64(),
  woodYieldPerQuantum: t.u64(),
  stoneYieldPerQuantum: t.u64(),
  goldYieldPerQuantum: t.u64(),
  travelPerEdgeMicros: t.i64(),
  levelOneBuildDurationMicros: t.i64(),
});

const gameplay04KeepStateV1 = t.object('Gameplay04KeepStateV1', {
  policyVersion: t.string(),
  layoutVersion: t.string(),
  layoutDigest: t.string(),
  revision: t.u64(),
  lastAcceptedSequence: t.u64(),
  food: t.u64(),
  wood: t.u64(),
  stone: t.u64(),
  gold: t.u64(),
  workers: t.array(gameplay04WorkerStateV1),
  buildings: t.array(gameplay04BuildingStateV1),
  project: t.option(gameplay04ProjectStateV1),
  completedLevels: gameplay04CompletedLevelsV1,
  completedEffects: gameplay04CompletedEffectsV1,
});

const gameplay04InitializeResultV1 = t.object('Gameplay04InitializeResultV1', {
  sequence: t.u64(),
  revision: t.u64(),
});

function closed(): never {
  throw new SenderError('GENESIS002_GAMEPLAY_CLOSED');
}

export const initializeGameplay04KeepV1 = genesis002.procedure(
  { name: 'initialize_gameplay04_keep_v1' },
  {
    sequence: t.u64(),
    requestKey: t.string(),
    expectedRevision: t.u64(),
    policyVersion: t.string(),
  },
  gameplay04InitializeResultV1,
  (ctx, _input) => ctx.withTx(_tx => closed()),
);

export const getGameplay04KeepV1 = genesis002.procedure(
  { name: 'get_gameplay04_keep_v1' },
  gameplay04KeepStateV1,
  ctx => ctx.withTx(_tx => closed()),
);
