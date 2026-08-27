import { requireAdmin } from '../../src/auth';
import type { Genesis002Context } from './population';

type Genesis001AdminContext = Parameters<typeof requireAdmin>[0];

/** Only the existing short-lived Hermes administrator principal may connect. */
export function requireGenesis002Admin(ctx: Genesis002Context) {
  return requireAdmin(ctx as unknown as Genesis001AdminContext);
}
