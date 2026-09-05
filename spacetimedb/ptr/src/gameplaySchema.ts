import { table, t } from 'spacetimedb/server';

import { getGameplay04ScheduleV1 } from './gameplayScheduleLink';

const gameplay04RoutePointV1 = t.object('Gameplay04RoutePointV1', {
  q: t.i32(),
  r: t.i32(),
});

const gameplay04JourneyV1 = t.object('Gameplay04JourneyV1', {
  resource: t.string(),
  dispatchedAt: t.i64(),
  routeEdges: t.u32(),
  travelPerEdgeMicros: t.i64(),
  gatheringDurationMicros: t.i64(),
  yieldPerQuantum: t.u64(),
  recalledAt: t.option(t.i64()),
});

const gameplay04AssignmentV1 = t.object('Gameplay04AssignmentV1', {
  nodeId: t.string(),
  locationId: t.string(),
  destinationCellKey: t.string(),
  route: t.array(gameplay04RoutePointV1),
  journey: gameplay04JourneyV1,
});

const gameplay04ReturnOutcomeV1 = t.object('Gameplay04ReturnOutcomeV1', {
  assignmentRevision: t.u64(),
  resource: t.string(),
  returnedAtMicros: t.i64(),
  earned: t.u64(),
  credited: t.u64(),
  overflow: t.u64(),
});

const gameplay04CostV1 = t.object('Gameplay04CostV1', {
  food: t.u64(),
  wood: t.u64(),
  stone: t.u64(),
  gold: t.u64(),
});

const gameplay04WorkerWakeupV1 = t.object('Gameplay04WorkerWakeupV1', {
  workerId: t.string(),
  assignmentRevision: t.u64(),
});

const gameplay04ProjectWakeupV1 = t.object('Gameplay04ProjectWakeupV1', {
  buildingId: t.string(),
  projectRevision: t.u64(),
});

export const gameplay04KeepV1 = table(
  { name: 'gameplay04_keep_v1' },
  {
    keepId: t.string().primaryKey(),
    databaseIdentity: t.string(),
    ownerFid: t.u64(),
    atlasId: t.string(),
    atlasRevision: t.u64(),
    anchorCellKey: t.string(),
    policyVersion: t.string(),
    revision: t.u64(),
    lastAcceptedSequence: t.u64(),
    food: t.u64(),
    wood: t.u64(),
    stone: t.u64(),
    gold: t.u64(),
    createdAtMicros: t.i64(),
  },
);

export const gameplay04WorkerV1 = table(
  { name: 'gameplay04_worker_v1' },
  {
    workerId: t.string().primaryKey(),
    keepId: t.string().index(),
    ordinal: t.u32(),
    assignmentRevision: t.u64(),
    assignment: t.option(gameplay04AssignmentV1),
    lastReturn: t.option(gameplay04ReturnOutcomeV1),
  },
);

export const gameplay04ReceiptV1 = table(
  { name: 'gameplay04_receipt_v1' },
  {
    receiptId: t.string().primaryKey(),
    keepId: t.string().index(),
    sequence: t.u64(),
    requestKey: t.string(),
    fingerprint: t.string(),
    resultRevision: t.u64(),
  },
);

export const gameplay04ReservationV1 = table(
  { name: 'gameplay04_reservation_v1' },
  {
    nodeId: t.string().primaryKey(),
    keepId: t.string().index(),
    workerId: t.string(),
    assignmentRevision: t.u64(),
  },
);

export const gameplay04BuildingV1 = table(
  { name: 'gameplay04_building_v1' },
  {
    buildingId: t.string().primaryKey(),
    keepId: t.string().index(),
    kind: t.string(),
    x: t.i64(),
    z: t.i64(),
    rotation: t.u32(),
    completedLevel: t.u32(),
    revision: t.u64(),
  },
);

export const gameplay04ProjectV1 = table(
  { name: 'gameplay04_project_v1' },
  {
    keepId: t.string().primaryKey(),
    projectRevision: t.u64(),
    buildingId: t.string(),
    targetLevel: t.u32(),
    startedAtMicros: t.i64(),
    completesAtMicros: t.i64(),
    cost: gameplay04CostV1,
    durationMicros: t.i64(),
    policyVersion: t.string(),
    layoutDigest: t.string(),
  },
);

export const gameplay04ScheduleV1 = table(
  {
    name: 'gameplay04_schedule_v1',
    scheduled: (): any => getGameplay04ScheduleV1(),
  },
  {
    scheduleId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    keepId: t.string().index(),
    lane: t.string(),
    worker: t.option(gameplay04WorkerWakeupV1),
    project: t.option(gameplay04ProjectWakeupV1),
  },
);
