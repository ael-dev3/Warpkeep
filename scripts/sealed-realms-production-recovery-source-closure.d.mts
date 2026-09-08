import type { SealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import type { SealedRealmsProductionSourceAuthority } from "./sealed-realms-production-source-authority.mjs";
declare const closureBrand: unique symbol;
export type SealedRealmsProductionRecoverySourceClosure = Readonly<{
  [closureBrand]: true;
}>;
export function createSealedRealmsProductionRecoverySourceClosure(
  input: Readonly<{
    privateState: SealedRealmsProductionPrivateState;
    authority: SealedRealmsProductionSourceAuthority;
  }>,
): Promise<SealedRealmsProductionRecoverySourceClosure>;
export function readSealedRealmsProductionRecoverySourceClosure(
  input: Readonly<{
    capability: SealedRealmsProductionRecoverySourceClosure;
    privateState: SealedRealmsProductionPrivateState;
    authority: SealedRealmsProductionSourceAuthority;
  }>,
): Readonly<{ sourceClosureSha256: string }>;
export function disposeSealedRealmsProductionRecoverySourceClosure(
  capability: SealedRealmsProductionRecoverySourceClosure,
): void;
