import ptr from './schema';
import { requirePtrConnection } from './auth';
import { requirePtrPopulationEmpty } from './context';

/** Only the exact fresh PTR administrator or enabled owner may connect. */
export const onConnect = ptr.clientConnected(ctx => {
  requirePtrConnection(ctx);
  requirePtrPopulationEmpty(ctx);
});
