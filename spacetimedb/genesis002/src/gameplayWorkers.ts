import { SenderError, t } from 'spacetimedb/server';

import genesis002 from './schema';

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

function closed(): never { throw new SenderError('GENESIS002_GAMEPLAY_CLOSED'); }

export const dispatchGameplay04WorkerV1 = genesis002.procedure(
  { name: 'dispatch_gameplay04_worker_v1' },
  {
    ...command,
    locationId: t.string(),
    resource: t.string(),
    gatheringDurationMicros: t.i64(),
  },
  resultV1,
  (ctx, _input) => ctx.withTx(_tx => closed()),
);

export const recallGameplay04WorkerV1 = genesis002.procedure(
  { name: 'recall_gameplay04_worker_v1' },
  command,
  resultV1,
  (ctx, _input) => ctx.withTx(_tx => closed()),
);
