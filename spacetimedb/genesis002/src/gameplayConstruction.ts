import { SenderError, t } from 'spacetimedb/server';

import genesis002 from './schema';

const costV1 = t.object('Gameplay04ConstructionCostInputV1', {
  food: t.u64(), wood: t.u64(), stone: t.u64(), gold: t.u64(),
});

const resultV1 = t.object('Gameplay04ConstructionCommandResultV1', {
  sequence: t.u64(), revision: t.u64(),
});

function closed(): never {
  throw new SenderError('GENESIS002_GAMEPLAY_CLOSED');
}

export const startGameplay04BuildingV1 = genesis002.procedure(
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
  (ctx, _input) => ctx.withTx(_tx => closed()),
);
