import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

import type warpkeep from '../schema';
import { CANONICAL_WORLD_TILES, matchesCanonicalTerrain } from '../world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

/**
 * Check first, then insert missing canonical rows. A bad pre-existing row
 * aborts the transaction; it is never overwritten or deleted automatically.
 */
export function seedCanonicalWorld(ctx: WarpkeepReducerContext): void {
  for (const row of ctx.db.worldTile.iter()) {
    if (!matchesCanonicalTerrain(row)) {
      throw new SenderError('WORLD_SEED_CONFLICT');
    }
  }

  for (const tile of CANONICAL_WORLD_TILES) {
    if (ctx.db.worldTile.key.find(tile.key) === null) {
      ctx.db.worldTile.insert({ ...tile, occupantCastleId: undefined });
    }
  }
}
