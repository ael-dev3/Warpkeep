import warpkeep from './schema';
import { requireWarpkeepConnection } from './auth';

/**
 * Reject anonymous and unrelated OIDC connections before they can acquire a
 * usable Warpkeep session. Exact fresh resolver credentials are admitted only
 * because SpacetimeDB executes this hook before HTTP procedures; downstream
 * guards deny them private/player/admin authority. A public subscription opened
 * while the token is fresh may persist until transport disconnect; protected
 * calls independently recheck resolver expiry.
 */
export const onConnect = warpkeep.clientConnected(ctx => {
  requireWarpkeepConnection(ctx);
});
