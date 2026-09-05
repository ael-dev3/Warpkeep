import { SenderError, t } from 'spacetimedb/server';

import genesis002 from './schema';

const gameplay04WorkerStateV1 = t.object('Gameplay04WorkerStateV1', {
  ordinal: t.u32(),
  assignmentRevision: t.u64(),
});

const gameplay04KeepStateV1 = t.object('Gameplay04KeepStateV1', {
  policyVersion: t.string(),
  revision: t.u64(),
  lastAcceptedSequence: t.u64(),
  food: t.u64(),
  wood: t.u64(),
  stone: t.u64(),
  gold: t.u64(),
  workers: t.array(gameplay04WorkerStateV1),
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
