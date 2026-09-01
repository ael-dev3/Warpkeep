import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import type ptr from './schema';
import {
  assertPtrPopulationEmpty,
  type PtrPopulationSnapshot,
} from './policy';

export type PtrContext = ReducerCtx<InferSchema<typeof ptr>>;

export function ptrPopulationSnapshot(ctx: PtrContext): PtrPopulationSnapshot {
  return Object.freeze({
    allowedFids: ctx.db.allowedFid.count(),
    accessRequests: ctx.db.accessRequestV1.count(),
    playersV1: ctx.db.player.count(),
    playersV2: ctx.db.playerV2.count(),
    ownershipBindings: ctx.db.playerOwnershipV2.count(),
    castles: ctx.db.castle.count(),
    realmProfiles: ctx.db.realmProfileV1.count(),
    termsAcceptances: ctx.db.alphaTermsAcceptanceV1.count(),
    markAccounts: ctx.db.markAccountV1.count(),
    resourceAccounts: ctx.db.resourceAccountV1.count(),
    castleClaims: ctx.db.greaterRealmCastleClaimV1.count(),
    cellOccupancies: ctx.db.greaterRealmCellOccupancyV1.count(),
    activationRows: ctx.db.greaterRealmActivationV1.count(),
    workerSystemRows: ctx.db.realmWorkerSystemV2.count(),
  });
}

export function requirePtrPopulationEmpty(ctx: PtrContext): void {
  assertPtrPopulationEmpty(ptrPopulationSnapshot(ctx));
}
