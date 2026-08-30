import { SenderError } from 'spacetimedb/server';

import {
  readFreshGenesis002AdminClaims,
} from './adminPolicy';
import type { Genesis002Context } from './population';

/** Only the dedicated short-lived Genesis 002 Hermes principal may connect. */
export function requireGenesis002Admin(ctx: Genesis002Context) {
  try {
    const jwt = ctx.senderAuth.jwt;
    if (jwt === undefined || jwt === null) throw new Error('JWT_REQUIRED');
    return readFreshGenesis002AdminClaims(
      jwt.fullPayload,
      ctx.timestamp.microsSinceUnixEpoch,
    );
  } catch {
    throw new SenderError('INVALID_GENESIS_002_ADMIN_SESSION');
  }
}
