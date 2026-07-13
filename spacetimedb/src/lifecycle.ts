import warpkeep from './schema';
import { requireWarpkeepConnection } from './auth';

/**
 * Reject anonymous and unrelated OIDC connections before they can acquire a
 * usable Warpkeep session. Only currently admitted players and fresh Hermes
 * administrators may open a subscription-bearing connection; the dedicated
 * resolver principal is limited to its HTTP procedure.
 */
export const onConnect = warpkeep.clientConnected(ctx => {
  requireWarpkeepConnection(ctx);
});
