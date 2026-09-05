import { table, t } from 'spacetimedb/server';

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
