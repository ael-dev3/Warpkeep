import { SenderError } from 'spacetimedb/server';

import { isTimestampGameplay04 } from '../../gameplay04/commands';
import { reconcileGameplay04 } from '../../gameplay04/reconciliation';
import { requirePtrReadyAtlas } from './atlasReadReducers';
import { PTR_OWNER_SINGLETON_KEY } from './contract';
import {
  decodeGameplay04Schedules,
  gameplay04Binding,
  gameplay04WorkerStorage,
} from './gameplayWorkers';
import { gameplay04ScheduleV1 } from './gameplaySchema';
import { linkGameplay04ScheduleV1 } from './gameplayScheduleLink';
import ptr from './schema';

function sameTime(left: any, right: any): boolean {
  return left?.tag === 'Time'
    && right?.tag === 'Time'
    && typeof left.value?.microsSinceUnixEpoch === 'bigint'
    && typeof right.value?.microsSinceUnixEpoch === 'bigint'
    && left.value.microsSinceUnixEpoch === right.value.microsSinceUnixEpoch;
}

function samePayload(current: any, arg: any): boolean {
  if (current.lane !== arg.lane) return false;
  if (current.lane === 'worker') {
    return current.worker !== undefined
      && arg.worker !== undefined
      && current.project === undefined
      && arg.project === undefined
      && current.worker.workerId === arg.worker.workerId
      && current.worker.assignmentRevision === arg.worker.assignmentRevision;
  }
  if (current.lane === 'project') {
    return current.project !== undefined
      && arg.project !== undefined
      && current.worker === undefined
      && arg.worker === undefined
      && current.project.buildingId === arg.project.buildingId
      && current.project.projectRevision === arg.project.projectRevision;
  }
  return false;
}

export const runGameplay04ScheduleV1 = ptr.reducer(
  { name: 'run_gameplay_04_schedule_v_1' },
  { arg: gameplay04ScheduleV1.rowType },
  (ctx, { arg }) => {
    if (ctx.connectionId !== null || !ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError('GAMEPLAY04_SCHEDULER_UNAUTHORIZED');
    }
    const stored = ctx.db.gameplay04_schedule_v1.scheduleId.find(arg.scheduleId);
    if (stored === null) return;
    const current = decodeGameplay04Schedules(ctx, stored.keepId)
      .find(row => row.scheduleId === stored.scheduleId);
    if (
      current === undefined
      || current.keepId !== arg.keepId
      || current.scheduleId !== arg.scheduleId
      || !sameTime(current.scheduledAt, arg.scheduledAt)
      || !samePayload(current, arg)
    ) return;
    const dueAt = current.dueAtMicros;
    if (!isTimestampGameplay04(dueAt) || dueAt > ctx.timestamp.microsSinceUnixEpoch) return;
    const keep = ctx.db.gameplay04KeepV1.keepId.find(current.keepId);
    if (keep === null || keep.databaseIdentity !== ctx.databaseIdentity.toHexString()) return;
    const anchor = ctx.db.ptrOwnerAnchorV1.singletonKey.find(PTR_OWNER_SINGLETON_KEY);
    if (
      anchor === null
      || ctx.db.ptrOwnerAnchorV1.count() !== 1n
      || !anchor.enabled
      || anchor.ownerFid !== keep.ownerFid
    ) return;
    const atlas = requirePtrReadyAtlas(ctx);
    const binding = gameplay04Binding(ctx, anchor.ownerFid, atlas);
    if (
      binding.keepId !== keep.keepId
      || binding.atlasId !== keep.atlasId
      || binding.atlasRevision !== keep.atlasRevision
      || binding.anchorCellKey !== keep.anchorCellKey
    ) return;
    if (current.lane === 'worker') {
      const worker = ctx.db.gameplay04WorkerV1.workerId.find(current.worker!.workerId);
      if (
        worker === null
        || worker.keepId !== keep.keepId
        || worker.assignmentRevision !== current.worker!.assignmentRevision
        || worker.assignment === undefined
      ) return;
    } else {
      const project = ctx.db.gameplay04ProjectV1.keepId.find(current.keepId);
      if (
        project === null
        || project.buildingId !== current.project!.buildingId
        || project.projectRevision !== current.project!.projectRevision
        || project.completesAtMicros !== dueAt
      ) return;
    }
    reconcileGameplay04(
      gameplay04WorkerStorage(ctx), binding, ctx.timestamp.microsSinceUnixEpoch,
    );
  },
);

linkGameplay04ScheduleV1(runGameplay04ScheduleV1);
