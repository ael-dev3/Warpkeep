import { ScheduleAt } from 'spacetimedb';
import { SenderError, t } from 'spacetimedb/server';

import {
  Gameplay04KeepError,
  type KeepBinding04,
} from '../../gameplay04/keep';
import {
  Gameplay04WorkerError,
  dispatchWorker04,
  preflightWorkerCommand04,
  recallWorker04,
  type DispatchWorkerInput04,
  type ResolvedDispatch04,
  type WorkerRow04,
  type WorkerStorage04,
} from '../../gameplay04/workers';
import {
  GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION,
  GREATER_REALM_UNASSIGNED_RANK,
  GREATER_REALM_VISIBLE_TIER_MAX,
  requireGreaterRealmOpaqueId,
} from './atlasPolicy';
import { planPtrTreeRoute } from './atlasReadPolicy';
import { requirePtrReadyAtlas, type PtrReadyAtlas } from './atlasReadReducers';
import { requirePtrOwner } from './auth';
import type { PtrContext } from './context';
import ptr from './schema';

const resultV1 = t.object('Gameplay04WorkerCommandResultV1', {
  sequence: t.u64(),
  revision: t.u64(),
});

const command = {
  sequence: t.u64(),
  requestKey: t.string(),
  expectedRevision: t.u64(),
  policyVersion: t.string(),
  expectedAtlasRevision: t.u64(),
  workerOrdinal: t.u32(),
};

const ZERO_COMPLETED_LEVELS = Object.freeze({
  'city-mill': 0,
  'lumber-camp': 0,
  'city-stoneworks': 0,
  'city-goldworks': 0,
  'city-barracks': 0,
  'grand-covenant-cathedral': 0,
});

function sender(error: unknown, fallback: string): never {
  if (error instanceof Gameplay04WorkerError || error instanceof Gameplay04KeepError) {
    throw new SenderError(error.code);
  }
  if (error instanceof SenderError) throw error;
  throw new SenderError(fallback);
}

function pureWorker(row: any): WorkerRow04 {
  return {
    workerId: row.workerId,
    keepId: row.keepId,
    ordinal: row.ordinal,
    assignmentRevision: row.assignmentRevision,
    assignment: row.assignment === undefined ? undefined : {
      ...row.assignment,
      route: row.assignment.route.map((point: any) => ({ q: point.q, r: point.r })),
      journey: {
        ...row.assignment.journey,
        recalledAt: row.assignment.journey.recalledAt ?? null,
      },
    },
    lastReturn: row.lastReturn,
  };
}

function storedWorker(row: WorkerRow04): any {
  return {
    workerId: row.workerId,
    keepId: row.keepId,
    ordinal: row.ordinal,
    assignmentRevision: row.assignmentRevision,
    assignment: row.assignment === undefined ? undefined : {
      ...row.assignment,
      route: row.assignment.route.map(point => ({ q: point.q, r: point.r })),
      journey: {
        ...row.assignment.journey,
        recalledAt: row.assignment.journey.recalledAt ?? undefined,
      },
    },
    lastReturn: row.lastReturn,
  };
}

function dueAtMicros(row: any): bigint {
  if (
    row.scheduledAt?.tag !== 'Time'
    || typeof row.scheduledAt.value?.microsSinceUnixEpoch !== 'bigint'
  ) throw new Gameplay04WorkerError('GAMEPLAY04_STORED_STATE_INVALID');
  return row.scheduledAt.value.microsSinceUnixEpoch;
}

export function gameplay04WorkerStorage(tx: PtrContext): WorkerStorage04 {
  return {
    findKeep: keepId => tx.db.gameplay04KeepV1.keepId.find(keepId),
    workers: keepId => [...tx.db.gameplay04WorkerV1.keepId.filter(keepId)].map(pureWorker),
    receipts: keepId => tx.db.gameplay04ReceiptV1.keepId.filter(keepId),
    reservations: keepId => tx.db.gameplay04ReservationV1.keepId.filter(keepId),
    schedules: keepId => [...tx.db.gameplay04_schedule_v1.keepId.filter(keepId)].map(row => ({
      scheduleId: row.scheduleId,
      keepId: row.keepId,
      workerId: row.workerId,
      assignmentRevision: row.assignmentRevision,
      dueAtMicros: dueAtMicros(row),
    })),
    findReservation: nodeId => tx.db.gameplay04ReservationV1.nodeId.find(nodeId),
    insertKeep: row => { tx.db.gameplay04KeepV1.insert(row); },
    insertWorker: row => { tx.db.gameplay04WorkerV1.insert(storedWorker({
      ...row, assignment: row.assignment, lastReturn: row.lastReturn,
    })); },
    insertReceipt: row => { tx.db.gameplay04ReceiptV1.insert(row); },
    updateKeep: row => { tx.db.gameplay04KeepV1.keepId.update(row); },
    updateWorker: row => { tx.db.gameplay04WorkerV1.workerId.update(storedWorker(row)); },
    deleteReceipt: receiptId => { tx.db.gameplay04ReceiptV1.receiptId.delete(receiptId); },
    insertReservation: row => { tx.db.gameplay04ReservationV1.insert(row); },
    deleteReservation: nodeId => { tx.db.gameplay04ReservationV1.nodeId.delete(nodeId); },
    insertSchedule: row => { tx.db.gameplay04_schedule_v1.insert({
      scheduleId: 0n,
      scheduledAt: ScheduleAt.time(row.dueAtMicros),
      keepId: row.keepId,
      workerId: row.workerId,
      assignmentRevision: row.assignmentRevision,
    }); },
    deleteSchedule: scheduleId => { tx.db.gameplay04_schedule_v1.scheduleId.delete(scheduleId); },
  };
}

export function gameplay04Binding(
  tx: PtrContext,
  ownerFid: bigint,
  atlas: PtrReadyAtlas,
): KeepBinding04 {
  const databaseIdentity = tx.databaseIdentity.toHexString();
  return Object.freeze({
    keepId: `g04:${databaseIdentity}:${ownerFid.toString()}`,
    databaseIdentity,
    ownerFid,
    atlasId: atlas.release.atlasId,
    atlasRevision: atlas.revision,
    anchorCellKey: atlas.anchorCell.cellKey,
  });
}

function resolveDispatch(
  tx: PtrContext,
  atlas: PtrReadyAtlas,
  input: DispatchWorkerInput04,
): ResolvedDispatch04 {
  const rows = [...tx.db.greaterRealmResourceNodeV1.locationId.filter(input.locationId)];
  if (rows.length < 1 || rows.length > GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION) {
    throw new SenderError('GAMEPLAY04_TARGET_INVALID');
  }
  if (rows.some(row => !Number.isSafeInteger(row.nodeOrdinal) || !Number.isSafeInteger(row.releaseOrdinal))) {
    throw new SenderError('GAMEPLAY04_TARGET_INVALID');
  }
  rows.sort((left, right) => left.nodeOrdinal - right.nodeOrdinal);
  const first = rows[0]!;
  const destination = tx.db.greaterRealmCellV1.cellKey.find(first.cellKey);
  if (
    destination === null
    || destination.atlasId !== atlas.release.atlasId
    || !destination.passable
    || destination.componentKey !== atlas.anchorCell.componentKey
    || first.componentKey !== destination.componentKey
    || destination.regionId !== first.regionId
    || destination.tier !== GREATER_REALM_VISIBLE_TIER_MAX
  ) throw new SenderError('GAMEPLAY04_TARGET_INVALID');
  const nodeIds = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    try { requireGreaterRealmOpaqueId(row.nodeId, 'GAMEPLAY04_TARGET_INVALID'); } catch {
      throw new SenderError('GAMEPLAY04_TARGET_INVALID');
    }
    if (
      nodeIds.has(row.nodeId)
      || row.locationId !== input.locationId
      || row.atlasId !== atlas.release.atlasId
      || row.cellKey !== first.cellKey
      || row.regionId !== first.regionId
      || row.componentKey !== first.componentKey
      || row.resourceKind !== input.resource
      || row.resourceKind !== first.resourceKind
      || row.policyVersion !== first.policyVersion
      || row.tier !== GREATER_REALM_VISIBLE_TIER_MAX
      || row.active
      || row.allocationRank !== GREATER_REALM_UNASSIGNED_RANK
      || row.nodeOrdinal !== first.nodeOrdinal + index
      || row.releaseOrdinal !== first.releaseOrdinal + index
    ) throw new SenderError('GAMEPLAY04_TARGET_INVALID');
    nodeIds.add(row.nodeId);
  }
  const path = planPtrTreeRoute(
    atlas.anchorCell,
    destination,
    (q, r) => tx.db.greaterRealmCellV1.atlasCoordKey.find(`A:${q}:${r}`),
  );
  if (
    path[0]?.cellKey !== atlas.anchorCell.cellKey
    || path[path.length - 1]?.cellKey !== destination.cellKey
  ) throw new SenderError('GAMEPLAY04_TARGET_INVALID');
  return Object.freeze({
    locationId: input.locationId,
    destinationCellKey: destination.cellKey,
    resource: input.resource,
    candidateNodeIds: Object.freeze(rows.map(row => row.nodeId)),
    route: Object.freeze(path.map(cell => Object.freeze({ q: cell.atlasQ, r: cell.atlasR }))),
    completed: ZERO_COMPLETED_LEVELS,
  });
}

export const dispatchGameplay04WorkerV1 = ptr.procedure(
  { name: 'dispatch_gameplay04_worker_v1' },
  {
    ...command,
    locationId: t.string(),
    resource: t.string(),
    gatheringDurationMicros: t.i64(),
  },
  resultV1,
  (ctx, input) => {
    try {
      return ctx.withTx(tx => {
        const { claims } = requirePtrOwner(tx);
        const atlas = requirePtrReadyAtlas(tx);
        const store = gameplay04WorkerStorage(tx);
        const binding = gameplay04Binding(tx, claims.fid, atlas);
        const commandInput = input as DispatchWorkerInput04;
        const preflight = preflightWorkerCommand04(
          store, binding, tx.timestamp.microsSinceUnixEpoch,
          { kind: 'dispatch', input: commandInput },
        );
        if (preflight.kind === 'replay') return preflight.result;
        return dispatchWorker04(
          store,
          binding,
          tx.timestamp.microsSinceUnixEpoch,
          commandInput,
          resolveDispatch(tx, atlas, commandInput),
        );
      });
    } catch (error) { return sender(error, 'GAMEPLAY04_DISPATCH_FAILED'); }
  },
);

export const recallGameplay04WorkerV1 = ptr.procedure(
  { name: 'recall_gameplay04_worker_v1' },
  command,
  resultV1,
  (ctx, input) => {
    try {
      return ctx.withTx(tx => {
        const { claims } = requirePtrOwner(tx);
        const atlas = requirePtrReadyAtlas(tx);
        return recallWorker04(
          gameplay04WorkerStorage(tx),
          gameplay04Binding(tx, claims.fid, atlas),
          tx.timestamp.microsSinceUnixEpoch,
          input,
        );
      });
    } catch (error) { return sender(error, 'GAMEPLAY04_RECALL_FAILED'); }
  },
);
