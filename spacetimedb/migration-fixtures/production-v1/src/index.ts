import productionV1 from './schema';
import { FIXTURE_WORLD_TILES } from './world';

export default productionV1;

/** Seeds only the disposable local migration fixture. */
export const init = productionV1.init(ctx => {
  for (const tile of FIXTURE_WORLD_TILES) {
    ctx.db.worldTile.insert({
      ...tile,
      occupantCastleId: undefined,
    });
  }
  ctx.db.player.insert({
    fid: 424_242n,
    identity: ctx.sender,
    username: 'synthetic-fixture',
    displayName: 'Synthetic Fixture',
    pfpUrl: undefined,
    joinedAt: ctx.timestamp,
    status: 'fixture-only',
  });
});
