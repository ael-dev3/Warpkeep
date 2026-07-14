import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

import type warpkeep from '../schema';
import {
  GenesisWorldDriftError,
  planCanonicalWorldSeed,
} from '../worldSeedPolicy';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

/**
 * Check first, then insert missing canonical rows. A bad pre-existing row
 * aborts the transaction; it is never overwritten or deleted automatically.
 */
export function seedCanonicalWorld(ctx: WarpkeepReducerContext): void {
  let plan;
  try {
    plan = planCanonicalWorldSeed({
      worldTiles: ctx.db.worldTile.iter(),
      realms: ctx.db.realmV1.iter(),
      worldMeta: ctx.db.worldTileMetaV1.iter(),
      castleSlots: ctx.db.castleSlotV1.iter(),
    });
  } catch (error) {
    if (error instanceof GenesisWorldDriftError) {
      throw new SenderError(error.message);
    }
    throw error;
  }

  for (const tile of plan.worldTiles) {
    ctx.db.worldTile.insert({ ...tile, occupantCastleId: undefined });
  }
  if (plan.realm !== undefined) {
    ctx.db.realmV1.insert({ ...plan.realm, createdAt: ctx.timestamp });
  }
  for (const meta of plan.worldMeta) {
    ctx.db.worldTileMetaV1.insert(meta);
  }
  for (const slot of plan.castleSlots) {
    ctx.db.castleSlotV1.insert(slot);
  }
}
