import warpkeep from './schema';
import { requireWarpkeepConnection } from './auth';

/**
 * Reject anonymous and unrelated OIDC connections before they can acquire a
 * usable Warpkeep session. Valid-but-unadmitted Farcaster users are allowed to
 * connect so the client can receive the narrow admission result.
 */
export const onConnect = warpkeep.clientConnected(ctx => {
  requireWarpkeepConnection(ctx);
});
