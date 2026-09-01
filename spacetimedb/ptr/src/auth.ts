import { SenderError } from 'spacetimedb/server';

import { PTR_OWNER_SINGLETON_KEY } from './contract';
import type { PtrContext } from './context';
import {
  PtrOwnerPolicyError,
  readFreshPtrAtlasAdminClaims,
  readFreshPtrAdminClaims,
  readFreshPtrOwnerClaims,
  requirePtrOwnerAnchor,
} from './ownerPolicy';

function payload(ctx: PtrContext): unknown {
  const jwt = ctx.senderAuth.jwt;
  if (jwt === null) throw new SenderError('AUTH_REQUIRED');
  return jwt.fullPayload;
}

function sender(error: unknown, fallback: string): never {
  if (error instanceof PtrOwnerPolicyError) throw new SenderError(error.code);
  if (error instanceof SenderError) throw error;
  throw new SenderError(fallback);
}

export function requirePtrAdmin(ctx: PtrContext) {
  try {
    return readFreshPtrAdminClaims(
      payload(ctx),
      ctx.timestamp.microsSinceUnixEpoch,
    );
  } catch (error) {
    return sender(error, 'INVALID_PTR_ADMIN_SESSION');
  }
}

export function requirePtrAtlasAdmin(ctx: PtrContext) {
  try {
    return readFreshPtrAtlasAdminClaims(
      payload(ctx),
      ctx.timestamp.microsSinceUnixEpoch,
    );
  } catch (error) {
    return sender(error, 'INVALID_PTR_ATLAS_ADMIN_SESSION');
  }
}

export function requirePtrOwner(ctx: PtrContext) {
  try {
    const claims = readFreshPtrOwnerClaims(
      payload(ctx),
      ctx.timestamp.microsSinceUnixEpoch,
    );
    const anchor = ctx.db.ptrOwnerAnchorV1.singletonKey.find(
      PTR_OWNER_SINGLETON_KEY,
    );
    return Object.freeze({
      claims,
      anchor: requirePtrOwnerAnchor(
        claims,
        anchor,
        ctx.db.ptrOwnerAnchorV1.count(),
      ),
    });
  } catch (error) {
    return sender(error, 'PTR_OWNER_NOT_AUTHORIZED');
  }
}

export function requirePtrConnection(ctx: PtrContext): void {
  try {
    requirePtrAtlasAdmin(ctx);
    return;
  } catch {
    // The owner-provisioning parser is an independently exact claim shape.
  }
  try {
    requirePtrAdmin(ctx);
    return;
  } catch {
    // The owner parser has an independently disjoint audience/role shape.
  }
  requirePtrOwner(ctx);
}
