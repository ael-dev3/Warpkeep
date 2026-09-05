import { SenderError, t } from 'spacetimedb/server';

import {
  Gameplay04KeepError,
  initializeKeep04,
  readKeep04,
  type KeepBinding04,
  type KeepStorage04,
} from '../../gameplay04/keep';
import { requirePtrOwner } from './auth';
import {
  requirePtrReadyAtlas,
  type PtrReadyAtlas,
} from './atlasReadReducers';
import type { PtrContext } from './context';
import ptr from './schema';

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

function sender(error: unknown, fallback: string): never {
  if (error instanceof Gameplay04KeepError) throw new SenderError(error.code);
  if (error instanceof SenderError) throw error;
  throw new SenderError(fallback);
}

function storage(tx: PtrContext): KeepStorage04 {
  return {
    findKeep: keepId => tx.db.gameplay04KeepV1.keepId.find(keepId),
    workers: keepId => tx.db.gameplay04WorkerV1.keepId.filter(keepId),
    receipts: keepId => tx.db.gameplay04ReceiptV1.keepId.filter(keepId),
    insertKeep: row => { tx.db.gameplay04KeepV1.insert(row); },
    insertWorker: row => { tx.db.gameplay04WorkerV1.insert(row); },
    insertReceipt: row => { tx.db.gameplay04ReceiptV1.insert(row); },
  };
}

function binding(
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

export const initializeGameplay04KeepV1 = ptr.procedure(
  { name: 'initialize_gameplay04_keep_v1' },
  {
    sequence: t.u64(),
    requestKey: t.string(),
    expectedRevision: t.u64(),
    policyVersion: t.string(),
  },
  gameplay04InitializeResultV1,
  (ctx, input) => {
    try {
      return ctx.withTx(tx => {
        const { claims } = requirePtrOwner(tx);
        const atlas = requirePtrReadyAtlas(tx);
        return initializeKeep04(
          storage(tx),
          binding(tx, claims.fid, atlas),
          tx.timestamp.microsSinceUnixEpoch,
          input,
        );
      });
    } catch (error) {
      return sender(error, 'GAMEPLAY04_INITIALIZE_FAILED');
    }
  },
);

export const getGameplay04KeepV1 = ptr.procedure(
  { name: 'get_gameplay04_keep_v1' },
  gameplay04KeepStateV1,
  ctx => {
    try {
      return ctx.withTx(tx => {
        const { claims } = requirePtrOwner(tx);
        const atlas = requirePtrReadyAtlas(tx);
        const state = readKeep04(
          storage(tx),
          binding(tx, claims.fid, atlas),
        );
        return {
          policyVersion: state.keep.policyVersion,
          revision: state.keep.revision,
          lastAcceptedSequence: state.keep.lastAcceptedSequence,
          food: state.keep.food,
          wood: state.keep.wood,
          stone: state.keep.stone,
          gold: state.keep.gold,
          workers: state.workers.map(worker => ({
            ordinal: worker.ordinal,
            assignmentRevision: worker.assignmentRevision,
          })),
        };
      });
    } catch (error) {
      return sender(error, 'GAMEPLAY04_READ_FAILED');
    }
  },
);
