import { SenderError } from 'spacetimedb/server';

import { reconcileWorkers04 } from '../../gameplay04/workers';
import { PTR_OWNER_SINGLETON_KEY } from './contract';
import { requirePtrReadyAtlas } from './atlasReadReducers';
import { gameplay04Binding, gameplay04WorkerStorage } from './gameplayWorkers';
import { gameplay04ScheduleV1 } from './gameplaySchema';
import { linkGameplay04ScheduleV1 } from './gameplayScheduleLink';
import ptr from './schema';

export const runGameplay04ScheduleV1 = ptr.reducer(
  { name: 'run_gameplay_04_schedule_v_1' },
  { arg: gameplay04ScheduleV1.rowType },
  (ctx, { arg }) => {
    if (ctx.connectionId !== null || !ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError('GAMEPLAY04_SCHEDULER_UNAUTHORIZED');
    }
    const current = ctx.db.gameplay04_schedule_v1.scheduleId.find(arg.scheduleId);
    if (current === null) return;
    if (
      current.keepId !== arg.keepId
      || current.workerId !== arg.workerId
      || current.assignmentRevision !== arg.assignmentRevision
      || current.scheduledAt.tag !== 'Time'
      || arg.scheduledAt.tag !== 'Time'
      || current.scheduledAt.value.microsSinceUnixEpoch
        !== arg.scheduledAt.value.microsSinceUnixEpoch
    ) return;
    const dueAt = current.scheduledAt.value.microsSinceUnixEpoch;
    if (dueAt > ctx.timestamp.microsSinceUnixEpoch) return;
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
    const worker = ctx.db.gameplay04WorkerV1.workerId.find(current.workerId);
    if (
      worker === null
      || worker.keepId !== keep.keepId
      || worker.assignmentRevision !== current.assignmentRevision
      || worker.assignment === undefined
    ) return;
    reconcileWorkers04(
      gameplay04WorkerStorage(ctx), binding, ctx.timestamp.microsSinceUnixEpoch,
    );
  },
);

linkGameplay04ScheduleV1(runGameplay04ScheduleV1);
