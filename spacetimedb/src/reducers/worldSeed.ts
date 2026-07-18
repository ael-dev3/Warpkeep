import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

import type warpkeep from '../schema';
import {
  GenesisWorldDriftError,
  planCanonicalWorldSeed,
  type GenesisSeedPlan,
} from '../worldSeedPolicy';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

function applyCanonicalWorldSeedPlan(
  ctx: WarpkeepReducerContext,
  plan: GenesisSeedPlan,
): void {
  for (const tile of plan.worldTiles) {
    ctx.db.worldTile.insert({ ...tile, occupantCastleId: undefined });
  }

  if (plan.realmTransition.kind === 'insert') {
    ctx.db.realmV1.insert({ ...plan.realmTransition.realm, createdAt: ctx.timestamp });
  } else if (plan.realmTransition.kind === 'update') {
    const existing = ctx.db.realmV1.realmId.find(plan.realmTransition.previous.realmId);
    if (
      existing === null
      || existing.publicName !== plan.realmTransition.previous.publicName
      || existing.seedName !== plan.realmTransition.previous.seedName
      || existing.numericSeed !== plan.realmTransition.previous.numericSeed
      || existing.generationVersion !== plan.realmTransition.previous.generationVersion
      || existing.authoritativeRadius !== plan.realmTransition.previous.authoritativeRadius
      || existing.renderRadius !== plan.realmTransition.previous.renderRadius
      || existing.playerCapacity !== plan.realmTransition.previous.playerCapacity
      || existing.active !== plan.realmTransition.previous.active
    ) {
      throw new SenderError('WORLD_SEED_CONFLICT');
    }
    ctx.db.realmV1.realmId.update({
      ...existing,
      ...plan.realmTransition.realm,
      createdAt: existing.createdAt,
    });
  }

  for (const meta of plan.worldMeta) {
    ctx.db.worldTileMetaV1.insert(meta);
  }
  for (const slot of plan.castleSlots) {
    ctx.db.castleSlotV1.insert(slot);
  }
}

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

  applyCanonicalWorldSeedPlan(ctx, plan);
}
