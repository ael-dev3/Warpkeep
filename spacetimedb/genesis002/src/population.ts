import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import type genesis002 from './schema';
import {
  assertGenesis002PopulationEmpty,
  type Genesis002PopulationSnapshot,
} from './policy';

export type Genesis002Context = ReducerCtx<InferSchema<typeof genesis002>>;

export function genesis002PopulationSnapshot(
  ctx: Genesis002Context,
): Genesis002PopulationSnapshot {
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

export function requireGenesis002PopulationEmpty(ctx: Genesis002Context): void {
  assertGenesis002PopulationEmpty(genesis002PopulationSnapshot(ctx));
  if (
    ctx.db.gameplay04KeepV1.count() !== 0n
    || ctx.db.gameplay04WorkerV1.count() !== 0n
    || ctx.db.gameplay04ReceiptV1.count() !== 0n
    || ctx.db.gameplay04ReservationV1.count() !== 0n
    || ctx.db.gameplay04BuildingV1.count() !== 0n
    || ctx.db.gameplay04ProjectV1.count() !== 0n
    || ctx.db.gameplay04_schedule_v1.count() !== 0n
  ) throw new Error('GENESIS_002_POPULATION_NOT_EMPTY');
}
