import genesis002 from './schema';
import { requireGenesis002Admin } from './auth';
import { requireGenesis002PopulationEmpty } from './population';

/**
 * Genesis 002 has no player connection path at sealed launch. The same
 * short-lived Hermes admin used by the private import operator is the sole
 * accepted principal, and any population drift closes even that connection.
 */
export const onConnect = genesis002.clientConnected(ctx => {
  requireGenesis002Admin(ctx);
  requireGenesis002PopulationEmpty(ctx);
});
