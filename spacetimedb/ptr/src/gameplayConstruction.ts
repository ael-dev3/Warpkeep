import { SenderError, t } from 'spacetimedb/server';

import {
  Gameplay04ConstructionError,
  startBuilding04,
  type StartBuildingInput04,
} from '../../gameplay04/construction';
import { Gameplay04KeepError } from '../../gameplay04/keep';
import { Gameplay04WorkerError } from '../../gameplay04/workers';
import { requirePtrReadyAtlas } from './atlasReadReducers';
import { requirePtrOwner } from './auth';
import { gameplay04Binding, gameplay04WorkerStorage } from './gameplayWorkers';
import ptr from './schema';

const costV1 = t.object('Gameplay04ConstructionCostInputV1', {
  food: t.u64(), wood: t.u64(), stone: t.u64(), gold: t.u64(),
});

const resultV1 = t.object('Gameplay04ConstructionCommandResultV1', {
  sequence: t.u64(), revision: t.u64(),
});

function sender(error: unknown): never {
  if (
    error instanceof Gameplay04ConstructionError
    || error instanceof Gameplay04KeepError
    || error instanceof Gameplay04WorkerError
  ) throw new SenderError(error.code);
  if (error instanceof SenderError) throw error;
  throw new SenderError('GAMEPLAY04_CONSTRUCTION_FAILED');
}

export const startGameplay04BuildingV1 = ptr.procedure(
  { name: 'start_gameplay04_building_v1' },
  {
    sequence: t.u64(),
    requestKey: t.string(),
    expectedRevision: t.u64(),
    expectedAtlasRevision: t.u64(),
    policyVersion: t.string(),
    layoutDigest: t.string(),
    kind: t.string(),
    targetLevel: t.u32(),
    x: t.i64(),
    z: t.i64(),
    rotation: t.u32(),
    expectedCost: costV1,
    expectedDurationMicros: t.i64(),
  },
  resultV1,
  (ctx, input) => {
    try {
      return ctx.withTx(tx => {
        const { claims } = requirePtrOwner(tx);
        const atlas = requirePtrReadyAtlas(tx);
        return startBuilding04(
          gameplay04WorkerStorage(tx),
          gameplay04Binding(tx, claims.fid, atlas),
          tx.timestamp.microsSinceUnixEpoch,
          input as StartBuildingInput04,
        );
      });
    } catch (error) {
      return sender(error);
    }
  },
);
