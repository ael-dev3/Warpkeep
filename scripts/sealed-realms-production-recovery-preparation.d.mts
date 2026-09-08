import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
declare const preparationBrand: unique symbol;
export type SealedRealmsProductionRecoveryPreparation = Readonly<{ [preparationBrand]: true }>;
type Owner = Readonly<{ privateState: SealedRealmsProductionPrivateState; authority: SealedRealmsProductionSourceAuthority }>;
/** Constructs from the fixed authenticated service and genuine private owner; accepts no caller facts. */
export function createSealedRealmsProductionRecoveryPreparation(input: Owner): Promise<SealedRealmsProductionRecoveryPreparation>;
export function readSealedRealmsProductionRecoveryPreparation(input: Owner & Readonly<{ capability: SealedRealmsProductionRecoveryPreparation }>): Readonly<{
  recoveryAuthorizationRequestId: string; recoveryAuthorizationEpoch: number;
}>;
/** Revokes in-process access; keeps immutable private evidence for an authenticated service retry. */
export function disposeSealedRealmsProductionRecoveryPreparation(capability: SealedRealmsProductionRecoveryPreparation): void;
